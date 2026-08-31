import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class {
    constructor() { throw new Error('[vitest] GPU disabled') }
  }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import {
  computeStats, computeDirectStats, scoreRed, scoreDigits, scoreTicketPlay,
  expandTicket, expandDirectTicket
} from '../src/utils/picker-engine'
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

describe('GPU/CPU consistency', () => {
  it('RED equal', () => {
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
          if (typeof cpu[k] !== 'number' || typeof gpu[k] !== 'number') continue
          expect(Math.abs(cpu[k] - gpu[k])).toBeLessThan(1e-9)
        }
        expect(cpu.parts).toEqual(gpu.parts)
        expect(cpu.zones).toEqual(gpu.zones)
        expect(cpu.total).toBe(gpu.total)
      }
    }
  })
  it('DIGIT equal', () => {
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
          if (typeof cpu[k] !== 'number' || typeof gpu[k] !== 'number') continue
          expect(Math.abs(cpu[k] - gpu[k])).toBeLessThan(1e-9)
        }
        expect(cpu.parts).toEqual(gpu.parts)
        expect(cpu.total).toBe(gpu.total)
      }
    }
  })
  it('compose equal', () => {
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

describe('expand & scoreTicketPlay', () => {
  it('ssq duplex expand', () => {
    const cfg = GAME_CONFIG.ssq
    const lines = expandTicket(cfg, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7], blue: [2, 8] })
    expect(lines).toHaveLength(7 * 2)
  })
  it('dlt danTuo expand', () => {
    const cfg = GAME_CONFIG.dlt
    const lines = expandTicket(cfg, { type: 'danTuo', danRed: [1, 2, 3], tuoRed: [4, 5, 6, 7], blueDan: [8], blueTuo: [9, 10, 11] })
    expect(lines).toHaveLength(6 * 3)
  })
  it('qlc duplex expand', () => {
    const cfg = GAME_CONFIG.qlc
    const lines = expandTicket(cfg, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7, 8], blue: [] })
    expect(lines).toHaveLength(8)
  })
  it('kl8 single expand', () => {
    const cfg = GAME_CONFIG.kl8
    const lines = expandTicket(cfg, { type: 'single', red: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blue: [] })
    expect(lines).toHaveLength(1)
  })
  it('fc3d direct expands', () => {
    const cfg = GAME_CONFIG.fc3d
    expect(expandDirectTicket(cfg, { type: 'single', digits: [1, 2, 3], zx: 'direct' })).toHaveLength(1)
    const dup = expandDirectTicket(cfg, { type: 'duplex', pos: [[1, 2], [3, 4], [5, 6]], zx: 'direct' })
    expect(dup).toHaveLength(8)
  })
  it('qxc pos duplex expand', () => {
    const cfg = GAME_CONFIG.qxc
    const dup = expandDirectTicket(cfg, { type: 'duplex', pos: [[1, 2], [3], [4], [5], [6], [7]], tail: [8, 9], zx: 'direct' })
    expect(dup).toHaveLength(2 * 2)
  })
  it('ssq scoreTicketPlay duplex', () => {
    const cfg = GAME_CONFIG.ssq
    const draws = comboDraws(cfg, 30)
    const r = scoreTicketPlay(cfg, draws, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7, 8], blue: [2, 8, 14] })
    expect(r.count).toBe(28 * 3)
    expect(r.max).toBeGreaterThanOrEqual(r.total)
    expect(r.total).toBeGreaterThanOrEqual(r.min)
    expect(r.lines).toHaveLength(28 * 3)
  })
  it('fc3d pos duplex expand+score', () => {
    const cfg = GAME_CONFIG.fc3d
    const draws = directDraws(cfg, 30)
    const st = computeDirectStats(cfg, draws)
    const lines = expandDirectTicket(cfg, { type: 'duplex', pos: [[1, 2], [3, 4], [5, 6]], zx: 'direct' })
    expect(lines).toHaveLength(8)
    const totals = lines.map((l) => scoreDigits(cfg, l.digits, l.tail, st).total || 0)
    expect(Math.max(...totals)).toBeGreaterThanOrEqual(0)
  })
})
