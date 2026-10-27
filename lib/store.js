/**
 * 大肥鱼的 token 账本。
 *
 * 数据源有两条，互为补充：
 *  1. 实时：DSH 的 `session/event` 里每条 `assistant/message` 都带真实 usage，
 *     我们按 input + cacheRead + cacheWrite + output 累加（reasoning 已含在 output 里，不重复算）。
 *  2. 历史：首次启用时，若本机装着「小鲸鱼」挂件，从 `$DSH_HOME/.dshw-usage.json`
 *     的逐轮记录里补算已经烧掉的量 —— 不然等级会从 0 重新爬。
 *
 * 账本落在 `$DSH_HOME/.dsh-fatfish-level.json`，只在本地，不上传。
 * 之后即使插件被临时停用，重新启用时也会用小鲸鱼的累计量做一次对账，补上缺口。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LADDER, levelFor, formatTokens, formatExact } from './levels.js'

const STATE_FILE = '.dsh-fatfish-level.json'
const WHALE_FILE = '.dshw-usage.json'
const MAX_DAY_KEYS = 400
const MAX_TURN_KEYS = 600
const MAX_MODEL_KEYS = 32
const SAVE_DEBOUNCE_MS = 1200
const RECONCILE_MS = 30_000

/** @param {unknown} value */
function tokenCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** usage 字段在不同厂商/版本里 camel / snake 混用，这里都认。 */
function usageTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0
  return (
    tokenCount(usage.inputTokens ?? usage.input_tokens) +
    tokenCount(usage.cacheReadTokens ?? usage.cache_read_tokens) +
    tokenCount(usage.cacheWriteTokens ?? usage.cache_write_tokens) +
    tokenCount(usage.outputTokens ?? usage.output_tokens)
  )
}

function modelOf(data) {
  try {
    const model =
      (data.message && data.message.source && data.message.source.model) ||
      (data.message && data.message.model) ||
      data.model ||
      ''
    const text = String(model).trim().slice(0, 80)
    return text || '未知模型'
  } catch (err) {
    return '未知模型'
  }
}

function dayKey(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function blankState() {
  return {
    v: 1,
    total: 0,
    turns: 0,
    byDay: {},
    byModel: {},
    turnKeys: [],
    seeded: null,
    lastEvent: null,
    updatedAt: null,
  }
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** 把磁盘上的任何畸形数据收敛成可用账本，坏字段直接丢，绝不让插件起不来。 */
function sanitize(raw) {
  const state = blankState()
  if (!raw || typeof raw !== 'object') return state
  state.total = Math.max(0, Number(raw.total) || 0)
  state.turns = Math.max(0, Math.round(Number(raw.turns) || 0))
  for (const [key, value] of Object.entries(safeObject(raw.byDay))) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(key)) state.byDay[key] = n
  }
  for (const [key, value] of Object.entries(safeObject(raw.byModel))) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0 && key) state.byModel[key.slice(0, 80)] = n
  }
  if (Array.isArray(raw.turnKeys)) {
    state.turnKeys = raw.turnKeys.filter((k) => typeof k === 'string').slice(-MAX_TURN_KEYS)
  }
  if (raw.seeded && typeof raw.seeded === 'object') {
    state.seeded = {
      source: raw.seeded.source === 'whale' ? 'whale' : 'none',
      tokens: Math.max(0, Number(raw.seeded.tokens) || 0),
      at: typeof raw.seeded.at === 'string' ? raw.seeded.at : '',
    }
  }
  if (raw.lastEvent && typeof raw.lastEvent === 'object') {
    state.lastEvent = {
      ts: typeof raw.lastEvent.ts === 'string' ? raw.lastEvent.ts : '',
      tokens: Math.max(0, Number(raw.lastEvent.tokens) || 0),
      model: String(raw.lastEvent.model || '').slice(0, 80),
    }
  }
  state.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null
  return state
}

function pruneDays(byDay) {
  const keys = Object.keys(byDay).sort()
  if (keys.length <= MAX_DAY_KEYS) return
  for (const key of keys.slice(0, keys.length - MAX_DAY_KEYS)) delete byDay[key]
}

function pruneModels(byModel) {
  const entries = Object.entries(byModel).sort((a, b) => b[1] - a[1])
  if (entries.length <= MAX_MODEL_KEYS) return
  for (const [key] of entries.slice(MAX_MODEL_KEYS)) delete byModel[key]
}

/**
 * @param {{ home?: string, now?: () => number, log?: (...args: unknown[]) => void }} [options]
 */
export function createStore(options = {}) {
  const home = options.home || process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const now = options.now || (() => Date.now())
  const log = options.log || (() => {})

  const statePath = path.join(home, STATE_FILE)
  const whalePath = path.join(home, WHALE_FILE)

  const state = blankState()
  let turnSet = new Set()
  let saveTimer = null
  let dirty = false
  let loaded = false
  let lastReconcile = 0
  let whaleCache = { stamp: '', data: null }

  const iso = () => new Date(now()).toISOString()

  function readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      if (err && err.code !== 'ENOENT') log('read failed:', file, err.message)
      return null
    }
  }

  function adopt(raw) {
    const next = sanitize(raw)
    Object.assign(state, next)
    turnSet = new Set(state.turnKeys)
  }

  /** 小鲸鱼账本：只取它记录的逐轮 token，并按天 / 模型聚合。 */
  function whaleStats() {
    let stamp
    try {
      const stat = fs.statSync(whalePath)
      stamp = `${stat.mtimeMs}:${stat.size}`
    } catch (err) {
      return null
    }
    if (whaleCache.stamp === stamp) return whaleCache.data
    const raw = readJson(whalePath)
    const events = raw && Array.isArray(raw.events) ? raw.events : []
    const byDay = {}
    const byModel = {}
    let total = 0
    for (const event of events) {
      if (!event || typeof event !== 'object') continue
      const tokens = tokenCount(event.tokens)
      if (tokens <= 0) continue
      total += tokens
      const day = typeof event.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.day)
        ? event.day
        : dayKey(Number(event.ts) || now())
      byDay[day] = (byDay[day] || 0) + tokens
      const model = String(event.model || '未知模型').slice(0, 80)
      byModel[model] = (byModel[model] || 0) + tokens
    }
    const data = total > 0 ? { total, byDay, byModel, turns: events.length } : null
    whaleCache = { stamp, data }
    return data
  }

  function seedIfNeeded() {
    if (state.seeded) return
    const whale = whaleStats()
    if (whale) {
      state.total = Math.max(state.total, whale.total)
      for (const [day, tokens] of Object.entries(whale.byDay)) {
        state.byDay[day] = Math.max(state.byDay[day] || 0, tokens)
      }
      for (const [model, tokens] of Object.entries(whale.byModel)) {
        state.byModel[model] = Math.max(state.byModel[model] || 0, tokens)
      }
      state.turns = Math.max(state.turns, whale.turns)
      state.seeded = { source: 'whale', tokens: whale.total, at: iso() }
    } else {
      state.seeded = { source: 'none', tokens: 0, at: iso() }
    }
    markDirty()
  }

  /**
   * 对账：小鲸鱼的累计量比我们多，说明插件停用期间漏记了。
   * 总量按小鲸鱼补齐；缺口归到「未记录」模型，今日/近七日仍只统计自己实时记到的量。
   */
  function reconcile(force = false) {
    const stamp = now()
    if (!force && stamp - lastReconcile < RECONCILE_MS) return false
    lastReconcile = stamp
    const whale = whaleStats()
    if (!whale) return false
    if (whale.total <= state.total + 1) return false
    const gap = whale.total - state.total
    state.total = whale.total
    state.byModel['未记录'] = (state.byModel['未记录'] || 0) + gap
    pruneModels(state.byModel)
    markDirty()
    log(`reconciled ${formatExact(gap)} tokens from whale ledger`)
    return true
  }

  function markDirty() {
    dirty = true
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      flush()
    }, SAVE_DEBOUNCE_MS)
    if (saveTimer && typeof saveTimer.unref === 'function') saveTimer.unref()
  }

  function flush() {
    if (!dirty) return false
    try {
      fs.mkdirSync(home, { recursive: true })
      state.updatedAt = iso()
      const body = JSON.stringify(state, null, 2)
      const tmp = `${statePath}.tmp`
      fs.writeFileSync(tmp, body, 'utf8')
      fs.renameSync(tmp, statePath)
      dirty = false
      return true
    } catch (err) {
      log('save failed:', err && err.message)
      return false
    }
  }

  function init() {
    if (loaded) return
    loaded = true
    adopt(readJson(statePath))
    seedIfNeeded()
    reconcile(true)
    pruneDays(state.byDay)
    pruneModels(state.byModel)
    flush()
  }

  /**
   * 吃一条会话事件。只认带 usage 的 assistant/message；turn 数按 (会话, 轮) 去重。
   * @param {unknown} session
   * @param {unknown} event
   */
  function record(session, event) {
    if (!event || typeof event !== 'object') return false
    if (event.type !== 'assistant/message') return false
    const data = event.data
    if (!data || typeof data !== 'object') return false
    const tokens = usageTokens(data.usage)
    if (tokens <= 0) return false

    const before = levelFor(state.total).current.lv

    const sessionId = session && typeof session === 'object' && session.id ? String(session.id) : 'default'
    const turn = Number(data.turn)
    if (Number.isFinite(turn)) {
      const key = `${sessionId}#${turn}`
      if (!turnSet.has(key)) {
        turnSet.add(key)
        state.turnKeys.push(key)
        state.turns += 1
        if (state.turnKeys.length > MAX_TURN_KEYS) {
          for (const old of state.turnKeys.splice(0, state.turnKeys.length - MAX_TURN_KEYS)) turnSet.delete(old)
        }
      }
    }

    const day = dayKey(now())
    state.total += tokens
    state.byDay[day] = (state.byDay[day] || 0) + tokens
    const model = modelOf(data)
    state.byModel[model] = (state.byModel[model] || 0) + tokens
    state.lastEvent = { ts: iso(), tokens, model }
    pruneDays(state.byDay)
    pruneModels(state.byModel)

    const after = levelFor(state.total).current.lv
    if (after > before) log(`level up: Lv.${before} -> Lv.${after}（累计 ${formatTokens(state.total)} tokens）`)

    markDirty()
    return true
  }

  function todayText() {
    return dayKey(now())
  }

  function lastWeekKeys() {
    const keys = []
    const base = now()
    for (let i = 0; i < 7; i += 1) keys.push(dayKey(base - i * 86_400_000))
    return keys
  }

  /** 给前端 / HTTP 的完整快照，不含任何路径、密钥或会话内容。 */
  function snapshot() {
    if (!loaded) init()
    reconcile(false)

    const total = state.total
    const level = levelFor(total)
    const today = dayKey(now())
    const todayTokens = state.byDay[today] || 0
    const weekTokens = lastWeekKeys().reduce((sum, key) => sum + (state.byDay[key] || 0), 0)

    const models = Object.entries(state.byModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([model, tokens]) => ({
        model,
        tokens,
        text: formatTokens(tokens),
        share: total > 0 ? Math.max(0, Math.min(1, tokens / total)) : 0,
      }))

    const ladder = LADDER.map((row) => ({
      lv: row.lv,
      name: row.name,
      desc: row.desc,
      color: row.color,
      atLeast: row.atLeast,
      atLeastText: formatTokens(row.atLeast),
      reached: total >= row.atLeast,
      current: row.lv === level.current.lv,
    }))

    const seededText = !state.seeded
      ? ''
      : state.seeded.source === 'whale'
        ? `已按小鲸鱼记账补算 ${formatTokens(state.seeded.tokens)} tokens 历史`
        : '从启用后开始计数'

    return {
      ok: true,
      v: 1,
      total,
      totalText: formatTokens(total),
      totalExact: formatExact(total),
      level: {
        lv: level.current.lv,
        name: level.current.name,
        desc: level.current.desc,
        color: level.current.color,
        atLeast: level.current.atLeast,
        atLeastText: formatTokens(level.current.atLeast),
        progress: level.progress,
        remainTokens: level.remain,
        remainText: level.next ? formatTokens(level.remain) : '',
        next: level.next
          ? {
              lv: level.next.lv,
              name: level.next.name,
              atLeast: level.next.atLeast,
              atLeastText: formatTokens(level.next.atLeast),
            }
          : null,
      },
      today: todayTokens,
      todayText: formatTokens(todayTokens),
      week: weekTokens,
      weekText: formatTokens(weekTokens),
      turns: state.turns,
      avgPerTurn: state.turns > 0 ? Math.round(total / state.turns) : 0,
      avgPerTurnText: formatTokens(state.turns > 0 ? total / state.turns : 0),
      byModel: models,
      ladder,
      seeded: state.seeded ? { source: state.seeded.source, tokens: state.seeded.tokens, text: seededText } : null,
      lastEvent: state.lastEvent,
      updatedAt: state.updatedAt,
      serverTime: now(),
    }
  }

  return {
    init,
    record,
    snapshot,
    flush,
    statePath,
    get total() { return state.total },
  }
}
