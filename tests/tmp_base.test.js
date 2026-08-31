import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class { constructor() { throw new Error('[vitest] GPU disabled') } }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import { computeStats, computeDirectStats, scoreRed, scoreDigits } from '../src/utils/picker-engine'

function comboDraws(cfg, n = 12) {
  const draws = []
  for (let i = 0; i < n; i++) {
    const redSet = new Set()
    while (redSet.size < cfg.redCount) redSet.add(1 + ((i * 7 + redSet.size * 5) % cfg.redMax))
    const red = [...redSet].sort((a, b) => a - b)
    const d = { red, issue: 'TEST' + i, date: '2026-01-' + String(i + 1).padStart(2, '0') }
    if (cfg.blueCount > 0) {
      const blueSet = new Set()
      while (blueSet.size < cfg.blueCount) blueSet.add(1 + ((i * 3 + blueSet.size * 4) % cfg.blueMax))
      d.blue = [...blueSet].sort((a, b) => a - b)
      if (cfg.blueCount > 1) d.blue2 = cfg.blueCount > 1 ? d.blue[1] : undefined
    }
    draws.push(d)
  }
  return draws
}
function directDraws(cfg, n = 12) {
  const draws = []
  for (let i = 0; i < n; i++) {
    const digits = cfg.digits.map((_, p) => (i + p * 3) % 10)
    const d = { digits, issue: 'TEST' + i, date: '2026-01-' + String(i + 1).padStart(2, '0') }
    if (cfg.tailMax != null) d.tail = (i * 2) % (cfg.tailMax + 1)
    draws.push(d)
  }
  return draws
}
const COMBO_KEYS = ['ssq', 'dlt', 'qlc', 'kl8']
const DIRECT_KEYS = ['fc3d', 'pl3', 'pl5', 'qxc']
describe('8 彩种评分基础', () => {
  for (const key of COMBO_KEYS) {
    it(`${key} scoreRed 评分在 [0,100] 内且结构完整`, () => {
      const cfg = GAME_CONFIG[key]
      const s = computeStats(cfg, comboDraws(cfg))
      const red = [1, 2, 3, 4, 5, 6].slice(0, cfg.redCount)
      const sc = scoreRed(cfg, red, s)
      expect(sc.total).toBeGreaterThanOrEqual(0)
      expect(sc.total).toBeLessThanOrEqual(100)
      expect(sc.zones).toHaveLength(3)
      expect(sc.odds).toBeTypeOf('number')
      expect(sc.sum).toBeGreaterThan(0)
      expect(sc.cons).toBeGreaterThanOrEqual(0)
      expect(sc.hotIn).toBeGreaterThanOrEqual(0)
    })
  }
  for (const key of DIRECT_KEYS) {
    it(`${key} scoreDigits 评分在 [0,100] 内且结构完整`, () => {
      const cfg = GAME_CONFIG[key]
      const s = computeDirectStats(cfg, directDraws(cfg))
      const digits = cfg.digits.map((_, p) => p % 10)
      const tail = cfg.tailMax != null ? 3 : null
      const sc = scoreDigits(cfg, digits, tail, s)
      expect(sc.total).toBeGreaterThanOrEqual(0)
      expect(sc.total).toBeLessThanOrEqual(100)
      expect(sc.span).toBeGreaterThanOrEqual(0)
      expect(sc.reps).toBeGreaterThanOrEqual(0)
    })
  }
})
