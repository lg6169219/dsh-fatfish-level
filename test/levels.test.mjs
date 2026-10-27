import test from 'node:test'
import assert from 'node:assert/strict'
import { LADDER, levelFor, formatTokens, formatExact } from '../lib/levels.js'

test('等级表单调递增且从 0 开始', () => {
  assert.equal(LADDER[0].atLeast, 0)
  for (let i = 1; i < LADDER.length; i += 1) {
    assert.ok(LADDER[i].atLeast > LADDER[i - 1].atLeast)
    assert.equal(LADDER[i].lv, LADDER[i - 1].lv + 1)
  }
})

test('token 量级映射到正确等级', () => {
  assert.equal(levelFor(0).current.lv, 1)
  assert.equal(levelFor(999_999).current.lv, 1)
  assert.equal(levelFor(3_000_000).current.lv, 2)
  assert.equal(levelFor(11_999_999).current.lv, 2)
  assert.equal(levelFor(12_000_000).current.lv, 3)
  assert.equal(levelFor(40_000_000).current.lv, 4)
  assert.equal(levelFor(100_000_000).current.lv, 5)
  assert.equal(levelFor(220_000_000).current.lv, 6)
  assert.equal(levelFor(330_086_879).current.lv, 6)
  assert.equal(levelFor(400_000_000).current.lv, 7)
  assert.equal(levelFor(400_000_000).current.name, '胖头鲸')
  assert.equal(levelFor(999_999_999).current.lv, 7)
  assert.equal(levelFor(1_000_000_000).current.lv, 8)
  assert.equal(levelFor(50_000_000_000).current.lv, 11)
  assert.equal(levelFor(999_000_000_000).current.lv, 13)
  assert.equal(levelFor(1_000_000_000_000).current.lv, 14)
  assert.equal(levelFor(2_000_000_000_000).current.lv, 14)
})

test('前期和后期都保持明显倍数', () => {
  const lv2 = LADDER[1].atLeast
  const lv3 = LADDER[2].atLeast
  const lv7 = LADDER[6].atLeast
  const lv8 = LADDER[7].atLeast
  const lv9 = LADDER[8].atLeast
  const lv14 = LADDER[13].atLeast
  assert.ok(lv3 / lv2 >= 4)
  assert.ok(lv7 >= 400_000_000)
  assert.ok(lv8 / lv7 >= 2.5)
  assert.ok(lv9 / lv8 >= 3)
  assert.ok(lv14 / LADDER[12].atLeast >= 3)
  assert.ok(lv14 >= 1_000_000_000_000)
})

test('进度与剩余量', () => {
  const lv7 = levelFor(500_000_000)
  assert.equal(lv7.next.lv, 8)
  assert.ok(lv7.progress > 0.16 && lv7.progress < 0.18)
  assert.equal(lv7.remain, 1_000_000_000 - 500_000_000)

  const top = levelFor(2_000_000_000_000)
  assert.equal(top.next, null)
  assert.equal(top.progress, 1)
  assert.equal(top.remain, 0)

  // 非法值一律按 0 处理，绝不让前端拿到 NaN
  assert.equal(levelFor(Number.NaN).current.lv, 1)
  assert.equal(levelFor(-5).current.lv, 1)
})

test('token 文本按万 / 亿 / 万亿收敛', () => {
  assert.equal(formatTokens(0), '0')
  assert.equal(formatTokens(9_999), '9999')
  assert.equal(formatTokens(12_000), '1.2万')
  assert.equal(formatTokens(1_000_000), '100万')
  assert.equal(formatTokens(330_086_879), '3.3亿')
  assert.equal(formatTokens(2_500_000_000), '25亿')
  assert.equal(formatTokens(1_200_000_000_000), '1.2万亿')
  assert.equal(formatExact(330_086_879), '330,086,879')
})
