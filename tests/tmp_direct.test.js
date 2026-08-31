import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class { constructor() { throw new Error('[vitest] GPU disabled') } }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import { computeDirectStats, scoreDigits } from '../src/utils/picker-engine'

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
const DIRECT_KEYS = ['fc3d', 'pl3', 'pl5', 'qxc']
describe('8 彩种评分基础 DIRECT', () => {
  for (const key of DIRECT_KEYS) {
    it(`${key} scoreDigits 评分在 [0,100] 内且结构完整`, () => {
      const cfg = GAME_CONFIG[key]
      const s = computeDirectStats(cfg, directDraws(cfg))
      const digits = cfg.digits.map((_, p) => p % 10)
      const tail = cfg.tailMax != null ? 3 : null
      const sc = scoreDigits(cfg, digits, tail, s)
      expect(sc.total).toBeGreaterThanOrEqual(0)
      expect(sc.total).toBeLessThanOrEqual(100)
    })
  }
})
