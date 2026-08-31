import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class {
    constructor() { throw new Error('[vitest] GPU disabled') }
  }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import { computeStats, computeDirectStats, scoreRed, scoreDigits } from '../src/utils/picker-engine'
import { scoreRedCPU, scoreDigitsCPU, composeRedTotal, composeDigitTotal } from '../src/utils/gpu-engine'

function comboDraws(cfg, n = 12) {
  const draws = []
  for (let i = 0; i < n; i++) {
    const redSet = new Set()
    while (redSet.size < cfg.redCount) redSet.add(1 + ((i * 11 + redSet.size * 7) % cfg.redMax))
    draws.push({ red: [...redSet].sort((a, b) => a - b), blue: cfg.blueMax ? 1 + ((i * 5) % cfg.blueMax) : null })
  }
  return draws
}

function directDraws(cfg, n = 12) {
  const draws = []
  for (let i = 0; i < n; i++) {
    draws.push({ digits: cfg.digits.map((_, p) => (i + p * 3) % 10), tail: cfg.tailMax != null ? (i % (cfg.tailMax + 1)) : null })
  }
  return draws
}

const COMBO_KEYS = Object.keys(GAME_CONFIG).filter((k) => GAME_CONFIG[k].redMax != null)
const DIRECT_KEYS = Object.keys(GAME_CONFIG).filter((k) => GAME_CONFIG[k].digits != null)

describe('consistency quick', () => {
  it('RED 21 items equal', () => {
    for (const key of COMBO_KEYS) {
      const cfg = GAME_CONFIG[key]
      const s = computeStats(cfg, comboDraws(cfg, 20))
      for (let t = 0; t < 20; t++) {
        const redSet = new Set()
        while (redSet.size < cfg.redCount) redSet.add(1 + ((t * 13 + redSet.size * 7) % cfg.redMax))
        const red = [...redSet].sort((a, b) => a - b)
        const cpu = scoreRedCPU(cfg, red, s)
        const gpu = scoreRed(cfg, red, s)
        for (const k of Object.keys(cpu)) {
          if (k === 'stats') continue
          expect(Math.abs(cpu[k] - gpu[k])).toBeLessThan(1e-9)
        }
        expect(cpu.total).toBe(gpu.total)
      }
    }
  })
  it('DIGIT 14 items equal', () => {
    for (const key of DIRECT_KEYS) {
      const cfg = GAME_CONFIG[key]
      const s = computeDirectStats(cfg, directDraws(cfg, 20))
      for (let t = 0; t < 20; t++) {
        const digits = cfg.digits.map((_, p) => (t + p * 4) % 10)
        const tail = cfg.tailMax != null ? (t % (cfg.tailMax + 1)) : null
        const cpu = scoreDigitsCPU(cfg, digits, tail, s)
        const gpu = scoreDigits(cfg, digits, tail, s)
        for (const k of Object.keys(cpu)) {
          if (k === 'stats') continue
          expect(Math.abs(cpu[k] - gpu[k])).toBeLessThan(1e-9)
        }
        expect(cpu.total).toBe(gpu.total)
      }
    }
  })
  it('compose totals equal', () => {
    const cfg = GAME_CONFIG.ssq
    const s = computeStats(cfg, comboDraws(cfg))
    const sc = scoreRed(cfg, [3, 8, 15, 22, 27, 31], s)
    expect(composeRedTotal(sc)).toBe(sc.total)
    const cfg3d = GAME_CONFIG.fc3d
    const s2 = computeDirectStats(cfg3d, directDraws(cfg3d))
    const sc2 = scoreDigits(cfg3d, [1, 4, 7], null, s2)
    expect(composeDigitTotal(sc2)).toBe(sc2.total)
  })
})
