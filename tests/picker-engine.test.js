// picker-engine / gpu-engine 评分引擎单元测试
// 覆盖 8 彩种（ssq/dlt/qlc/kl8/fc3d/pl3/pl5/qxc）全玩法（单注/复式/胆拖/组选3/组选6/定位复式）
// 含 GPU/CPU 评分一致性断言（maxErr=0 保留校验）
import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class {
    constructor() { throw new Error('[vitest] GPU disabled') }
  }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import {
  computeStats, computeDirectStats, scoreRed, scoreDigits, scoreTicketPlay,
  expandTicket, expandDirectTicket, scoreTicket, generateBatch
} from '../src/utils/picker-engine'
import { scoreRedCPU, scoreDigitsCPU, composeRedTotal, composeDigitTotal } from '../src/utils/gpu-engine'

// 构造固定开奖样本（combo 彩种）
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

// 构造固定开奖样本（direct 彩种）
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

describe('GPU/CPU 评分一致性断言（maxErr=0）', () => {
  it('RED：scoreRedCPU 与 scoreRed 21 分项 + 总分完全一致', () => {
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

  it('DIGIT：scoreDigitsCPU 与 scoreDigits 14 分项 + 总分完全一致', () => {
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

  it('composeRedTotal/composeDigitTotal 加权合成与 score 总分一致', () => {
    const cfg = GAME_CONFIG.ssq
    const s = computeStats(cfg, comboDraws(cfg))
    const red = [3, 8, 15, 22, 27, 31]
    const sc = scoreRed(cfg, red, s)
    expect(composeRedTotal(sc)).toBe(sc.total)
    const cfg3d = GAME_CONFIG.fc3d
    const s2 = computeDirectStats(cfg3d, directDraws(cfg3d))
    const sc2 = scoreDigits(cfg3d, [1, 4, 7], null, s2)
    expect(composeDigitTotal(sc2)).toBe(sc2.total)
  })
})

describe('展开与玩法', () => {
  it('ssq 复式展开数量 = C(red,6)*C(blue,1)', () => {
    const cfg = GAME_CONFIG.ssq
    const lines = expandTicket(cfg, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7], blue: [2, 8] })
    expect(lines).toHaveLength(7 * 2)
    lines.forEach((l) => {
      expect(l.red).toHaveLength(6)
      expect(new Set(l.red).size).toBe(6)
      expect(l.blue).toHaveLength(1)
    })
  })

  it('dlt 前区胆拖 + 后区胆拖展开', () => {
    const cfg = GAME_CONFIG.dlt
    // 前区：3 胆 + 从 4 拖中选 2；后区：1 胆 + 从 3 拖中选 1
    const lines = expandTicket(cfg, {
      type: 'danTuo',
      danRed: [1, 2, 3],
      tuoRed: [4, 5, 6, 7],
      blueDan: [8],
      blueTuo: [9, 10, 11]
    })
    expect(lines).toHaveLength(6 * 3)
    lines.forEach((l) => {
      expect(l.red).toHaveLength(5)
      expect(l.red.slice(0, 3)).toEqual([1, 2, 3])
      expect(l.blue).toHaveLength(2)
      expect(l.blue).toContain(8)
    })
  })

  it('qlc 复式展开（无蓝球）', () => {
    const cfg = GAME_CONFIG.qlc
    const lines = expandTicket(cfg, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7, 8], blue: [] })
    expect(lines).toHaveLength(8)
    lines.forEach((l) => expect(l.red).toHaveLength(7))
  })

  it('kl8 选十单注展开', () => {
    const cfg = GAME_CONFIG.kl8
    const lines = expandTicket(cfg, { type: 'single', red: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blue: [] })
    expect(lines).toHaveLength(1)
  })

  it('fc3d 直选/组选3/组选6/定位复式展开', () => {
    const cfg = GAME_CONFIG.fc3d
    expect(expandDirectTicket(cfg, { type: 'single', digits: [1, 2, 3], zx: 'direct' })).toHaveLength(1)
    expect(expandDirectTicket(cfg, { type: 'single', digits: [1, 1, 2], zx: 'zuxuan3' })[0].zx).toBe('zuxuan3')
    expect(expandDirectTicket(cfg, { type: 'single', digits: [1, 2, 3], zx: 'zuxuan6' })[0].zx).toBe('zuxuan6')
    // 定位复式：百位2个 × 十位2个 × 个位2个 = 8 注
    const dup = expandDirectTicket(cfg, { type: 'duplex', pos: [[1, 2], [3, 4], [5, 6]], zx: 'direct' })
    expect(dup).toHaveLength(8)
    dup.forEach((l) => expect(l.digits).toHaveLength(3))
  })

  it('qxc 定位复式含尾位展开', () => {
    const cfg = GAME_CONFIG.qxc
    const dup = expandDirectTicket(cfg, { type: 'duplex', pos: [[1, 2], [3], [4], [5], [6], [7]], tail: [8, 9], zx: 'direct' })
    expect(dup).toHaveLength(2 * 2)
    dup.forEach((l) => {
      expect(l.digits).toHaveLength(6)
      expect([8, 9]).toContain(l.tail)
    })
  })
})

describe('票评分 scoreTicketPlay', () => {
  it('ssq 复式票平均/最高/最低分', () => {
    const cfg = GAME_CONFIG.ssq
    const draws = comboDraws(cfg, 30)
    const r = scoreTicketPlay(cfg, draws, { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7, 8], blue: [2, 8, 14] })
    expect(r.count).toBe(28 * 3)
    expect(r.max).toBeGreaterThanOrEqual(r.total)
    expect(r.total).toBeGreaterThanOrEqual(r.min)
    expect(r.lines).toHaveLength(28 * 3)
    r.lines.forEach((l) => {
      expect(l.score.total).toBeGreaterThanOrEqual(0)
      expect(l.score.total).toBeLessThanOrEqual(100)
    })
  })

  it('fc3d 定位复式票评分', () => {
    const cfg = GAME_CONFIG.fc3d
    const draws = directDraws(cfg, 30)
    const r = scoreTicketPlay(cfg, draws, { type: 'duplex', pos: [[1, 2], [3, 4], [5, 6]], zx: 'direct' })
    expect(r.count).toBe(8)
    expect(r.total).toBeGreaterThanOrEqual(0)
  })
})

describe('generateBatch（CPU 强制路径）', () => {
  it('ssq 单注批量生成', async () => {
    const cfg = GAME_CONFIG.ssq
    const draws = comboDraws(cfg, 30)
    const r = await generateBatch(cfg, draws, { play: { type: 'single' }, count: 200, useGpu: false })
    expect(r).toBeTruthy()
    expect(r.ticket).toBeTruthy()
    expect(r.total).toBeGreaterThanOrEqual(0)
    expect(r.total).toBeLessThanOrEqual(100)
    expect(r.level).toBe('cpu')
  })

  it('ssq 复式批量生成（useGpu=false 走 CPU 采样生成）', async () => {
    const cfg = GAME_CONFIG.ssq
    const draws = comboDraws(cfg, 30)
    const r = await generateBatch(cfg, draws, { play: { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7, 8], blue: [2, 8] }, count: 200, useGpu: false })
    expect(r).toBeTruthy()
    expect(r.level).toBe('cpu')
    expect(r.lines.length).toBeGreaterThan(0)
  })

  it('dlt 胆拖批量生成（useGpu=false 走 CPU 采样生成）', async () => {
    const cfg = GAME_CONFIG.dlt
    const draws = comboDraws(cfg, 30)
    const r = await generateBatch(cfg, draws, { play: { type: 'danTuo', danRed: [1, 2, 3], tuoRed: [4, 5, 6, 7], blue: [8, 9] }, count: 200, useGpu: false })
    expect(r).toBeTruthy()
    expect(r.level).toBe('cpu')
    expect(r.lines.length).toBeGreaterThan(0)
  })

  it('fc3d 直选批量生成', async () => {
    const cfg = GAME_CONFIG.fc3d
    const draws = directDraws(cfg, 30)
    const r = await generateBatch(cfg, draws, { play: { type: 'single' }, count: 200, useGpu: false })
    expect(r).toBeTruthy()
    expect(r.ticket).toBeTruthy()
  })
})
