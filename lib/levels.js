/**
 * 大肥鱼等级表 —— 插件唯一的口径来源，服务端与客户端都读这里。
 *
 * Lv.2–4 每级约 3～4 倍，Lv.5–7 约 2 倍，前期也有足够的爬坡；
 * 从 Lv.8 起继续 3～4 倍一档，越往后越像长线养成，不会一两天就顶格。
 * 单轮对话动辄百万 token，所以第一级之后很快就到千万、亿级；
 * 最高一级是 1 万亿，留给真正的长期玩家。
 *
 * 想调门槛：改下面的 atLeast（累计 token 数），name / desc / color 会跟着走。
 * 注意：浏览器端 `lib/client.js` 顶部的 `THRESHOLDS` 要同步（有测试会比对）。
 */

/** @typedef {{ lv: number, name: string, atLeast: number, desc: string, color: string }} LevelRow */

/** @type {LevelRow[]} 按 atLeast 升序，第一级必须是 0 */
export const LADDER = [
  { lv: 1, name: '鱼苗', atLeast: 0, desc: '刚破卵，先学会在 token 里呼吸。', color: '#5aa9ff' },
  { lv: 2, name: '小鱼花', atLeast: 3_000_000, desc: '尾巴开始有力气了。', color: '#4ea8ff' },
  { lv: 3, name: '小肥鱼', atLeast: 12_000_000, desc: '一顿能吃掉一个上下文。', color: '#3fb6f5' },
  { lv: 4, name: '圆肚鱼', atLeast: 40_000_000, desc: '肚子圆起来了，游得慢但吃得多。', color: '#2fc4c9' },
  { lv: 5, name: '肥鱼', atLeast: 100_000_000, desc: '开始有人叫你肥鱼了。', color: '#1fbfa5' },
  { lv: 6, name: '大肥鱼', atLeast: 220_000_000, desc: '缸里最圆的那条，就是你了。', color: '#12b886' },
  { lv: 7, name: '胖头鲸', atLeast: 400_000_000, desc: '脑袋里装满了上下文。', color: '#7b8cff' },
  { lv: 8, name: '巨鲸', atLeast: 1_000_000_000, desc: '一次深呼吸，就是百万 token。', color: '#6c6cff' },
  { lv: 9, name: '深海霸主', atLeast: 3_000_000_000, desc: '深海里没有光，只有你的账单在发光。', color: '#8a5cff' },
  { lv: 10, name: '吞星鲸', atLeast: 10_000_000_000, desc: '星星是零食，token 是主食。', color: '#ff9f43' },
  { lv: 11, name: '银河鲸', atLeast: 30_000_000_000, desc: '在银河里打滚，激起一片缓存命中。', color: '#ff8a3d' },
  { lv: 12, name: '宇宙肥鱼', atLeast: 100_000_000_000, desc: '质量和 token 都把时空压弯了。', color: '#ff6b8a' },
  { lv: 13, name: '究极肥鱼', atLeast: 300_000_000_000, desc: '已经无法用鱼类学描述了。', color: '#ff4d6d' },
  { lv: 14, name: '维度吞噬者', atLeast: 1_000_000_000_000, desc: '连上下文窗口都一口吞下。', color: '#ffd166' },
]

/**
 * 按累计 token 找到当前等级。
 * @param {number} total
 * @returns {{ index: number, current: LevelRow, next: LevelRow | null, progress: number, remain: number }}
 */
export function levelFor(total) {
  const n = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : 0
  let index = 0
  for (let i = LADDER.length - 1; i >= 0; i -= 1) {
    if (n >= LADDER[i].atLeast) { index = i; break }
  }
  const current = LADDER[index]
  const next = LADDER[index + 1] || null
  if (!next) return { index, current, next: null, progress: 1, remain: 0 }
  const span = next.atLeast - current.atLeast
  const progress = span > 0 ? Math.max(0, Math.min(1, (n - current.atLeast) / span)) : 0
  return { index, current, next, progress, remain: Math.max(0, next.atLeast - n) }
}

/** 把 token 数写成中文的「万 / 亿 / 万亿」，便于一眼读量级。 */
export function formatTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 10_000) return String(Math.round(n))
  const units = [
    { base: 1e12, suffix: '万亿' },
    { base: 1e8, suffix: '亿' },
    { base: 1e4, suffix: '万' },
  ]
  for (const { base, suffix } of units) {
    if (n < base) continue
    const v = n / base
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2
    const text = v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
    return text + suffix
  }
  return String(Math.round(n))
}

/** 精确数字：3,300,868,79 这种，用于 tooltip / 面板次级信息。 */
export function formatExact(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  return Math.round(n).toLocaleString('zh-CN')
}
