import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class { constructor() { throw new Error('[vitest] GPU disabled') } }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import { computeStats, scoreRed } from '../src/utils/picker-engine'

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
const COMBO_KEYS = ['ssq', 'dlt', 'qlc', 'kl8']
describe('8 彩种评分基础 COMBO', () => {
  for (const key of COMBO_KEYS) {
    it(`${key} scoreRed 评分在 [0,100] 内且结构完整`, () => {
      const cfg = GAME_CONFIG[key]
      const s = computeStats(cfg, comboDraws(cfg))
      const red = [1, 2, 3, 4, 5, 6].slice(0, cfg.redCount)
      const sc = scoreRed(cfg, red, s)
      expect(sc.total).toBeGreaterThanOrEqual(0)
      expect(sc.total).toBeLessThanOrEqual(100)
      expect(sc.zones).toHaveLength(3)
    })
  }
})
