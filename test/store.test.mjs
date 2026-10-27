import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../lib/store.js'

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshf-test-'))
}

function writeWhale(home, events) {
  fs.writeFileSync(path.join(home, '.dshw-usage.json'), JSON.stringify({ events }), 'utf8')
}

function message(turn, usage, model = 'deepseek-flash') {
  return { type: 'assistant/message', data: { turn, usage, message: { source: { model } } } }
}

const NOW = new Date('2026-10-27T02:00:00.000Z').getTime()

test('首次启用时用小鲸鱼账本补算历史', () => {
  const home = tempHome()
  writeWhale(home, [
    { ts: 1, day: '2026-10-26', model: 'deepseek-flash', tokens: 390_000_000, cost: 1 },
    { ts: 2, day: '2026-10-26', model: 'glm-5.3-flash', tokens: 30_000_000, cost: 1 },
  ])
  const store = createStore({ home, now: () => NOW })
  store.init()
  const snap = store.snapshot()
  assert.equal(snap.total, 420_000_000)
  assert.equal(snap.level.lv, 7)
  assert.equal(snap.level.name, '胖头鲸')
  assert.equal(snap.seeded.source, 'whale')
  assert.equal(snap.seeded.tokens, 420_000_000)
})

test('实时会话事件累加，按轮去重', () => {
  const home = tempHome()
  const store = createStore({ home, now: () => NOW })
  store.init()

  const session = { id: 's1' }
  assert.equal(store.record(session, message(1, { inputTokens: 1000, cacheReadTokens: 2000, outputTokens: 500 })), true)
  assert.equal(store.record(session, message(1, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 50 })), true)
  assert.equal(store.record(session, message(2, { input_tokens: 10, cache_read_tokens: 20, cache_write_tokens: 5, output_tokens: 1 })), true)

  // 无 usage / 其它事件 / 全零 usage 都不该记账
  assert.equal(store.record(session, { type: 'assistant/message', data: { turn: 3 } }), false)
  assert.equal(store.record(session, { type: 'turn/end', data: {} }), false)
  assert.equal(store.record(session, message(3, { inputTokens: 0, outputTokens: 0 })), false)

  const snap = store.snapshot()
  assert.equal(snap.total, 1000 + 2000 + 500 + 100 + 50 + 36)
  assert.equal(snap.turns, 2)
  assert.equal(snap.today, snap.total)
  assert.ok(snap.byModel.some((row) => row.model === 'deepseek-flash'))
})

test('账本落盘后可恢复，且保留种子来源', () => {
  const home = tempHome()
  writeWhale(home, [{ ts: 1, day: '2026-10-20', model: 'deepseek-flash', tokens: 200_000_000 }])
  const first = createStore({ home, now: () => NOW })
  first.init()
  first.record({ id: 's1' }, message(1, { inputTokens: 1_000_000, outputTokens: 0 }))
  assert.equal(first.flush(), true)

  const second = createStore({ home, now: () => NOW + 60_000 })
  const snap = second.snapshot()
  assert.equal(snap.total, 201_000_000)
  assert.equal(snap.seeded.source, 'whale')
  assert.ok(fs.existsSync(path.join(home, '.dsh-fatfish-level.json')))
})

test('小鲸鱼账本更大时对账补差，今日口径不被污染', () => {
  const home = tempHome()
  writeWhale(home, [{ ts: 1, day: '2026-10-20', model: 'deepseek-flash', tokens: 100_000_000 }])
  const first = createStore({ home, now: () => NOW })
  first.init()
  first.flush()
  assert.equal(first.snapshot().total, 100_000_000)

  // 模拟插件停用期间又烧了 5,000 万
  writeWhale(home, [
    { ts: 1, day: '2026-10-20', model: 'deepseek-flash', tokens: 100_000_000 },
    { ts: 2, day: '2026-10-27', model: 'deepseek-flash', tokens: 50_000_000 },
  ])
  const second = createStore({ home, now: () => NOW + 120_000 })
  const snap = second.snapshot()
  assert.equal(snap.total, 150_000_000)
  assert.ok(snap.byModel.some((row) => row.model === '未记录'))
  // 今日仍只算自己实时记到的，不把补账塞进今天
  assert.equal(snap.today, 0)
})

test('畸形账本不会让插件崩溃', () => {
  const home = tempHome()
  fs.writeFileSync(path.join(home, '.dsh-fatfish-level.json'), '{ not json', 'utf8')
  const store = createStore({ home, now: () => NOW })
  store.init()
  const snap = store.snapshot()
  assert.equal(snap.ok, true)
  assert.equal(snap.total, 0)
  assert.equal(snap.level.lv, 1)
})
