// prize-check 兑奖逻辑单元测试
// 覆盖 8 彩种全玩法：单注/复式/胆拖/组选3/组选6/定位复式
import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class {
    constructor() { throw new Error('[vitest] GPU disabled') }
  }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import {
  checkPrize, checkPrizeDirect, checkTicket, checkTicketDirect,
  checkTicketHistory, checkTicketHistoryMulti, kl8Prize, isBigWin
} from '../src/utils/prize-check'

const drawCombo = (red, blue, extra = {}) => ({
  red,
  blue: blue[0],
  blue2: blue[1],
  issue: 'T2026001',
  date: '2026-01-01',
  ...extra
})

const drawDirect = (digits, tail = null, extra = {}) => ({
  digits,
  tail,
  issue: 'T2026001',
  date: '2026-01-01',
  ...extra
})

describe('ssq 单注兑奖', () => {
  const cfg = GAME_CONFIG.ssq
  it('一等奖 6+1（浮动奖金）', () => {
    const p = checkPrize(cfg, [1, 2, 3, 4, 5, 6], [7], drawCombo([1, 2, 3, 4, 5, 6], [7], { firstPrizePerBet: 8000000 }))
    expect(p.level).toBe(1)
    expect(p.name).toBe('一等奖')
    expect(p.bonus).toBe(8000000)
    expect(isBigWin(p)).toBe(true)
  })
  it('二等奖 6+0', () => {
    const p = checkPrize(cfg, [1, 2, 3, 4, 5, 6], [7], drawCombo([1, 2, 3, 4, 5, 6], [8], { firstPrizePerBet: 300000 }))
    expect(p.level).toBe(2)
    expect(isBigWin(p)).toBe(true)
  })
  it('五等奖 4+0 / 3+1', () => {
    expect(checkPrize(cfg, [1, 2, 3, 4, 5, 6], [7], drawCombo([1, 2, 3, 4, 9, 10], [8])).level).toBe(5)
    expect(checkPrize(cfg, [1, 2, 3, 4, 5, 6], [7], drawCombo([1, 2, 3, 9, 10, 11], [7])).level).toBe(5)
  })
  it('六等奖 0+1', () => {
    const p = checkPrize(cfg, [9, 10, 11, 12, 13, 14], [7], drawCombo([1, 2, 3, 4, 5, 6], [7]))
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(5)
  })
  it('未中奖', () => {
    const p = checkPrize(cfg, [9, 10, 11, 12, 13, 14], [8], drawCombo([1, 2, 3, 4, 5, 6], [7]))
    expect(p.level).toBe(0)
    expect(p.name).toBe('未中奖')
  })
})

describe('dlt 单注兑奖（含追加）', () => {
  const cfg = GAME_CONFIG.dlt
  it('一等奖 5+2 浮动，追加 ×1.8', () => {
    const p = checkPrize(cfg, [1, 2, 3, 4, 5], [6, 7], drawCombo([1, 2, 3, 4, 5], [6, 7], { firstPrizePerBet: 10000000 }), true)
    expect(p.level).toBe(1)
    expect(p.bonus).toBe(18000000)
  })
  it('八等奖 3+1 / 2+2', () => {
    expect(checkPrize(cfg, [1, 2, 3, 4, 5], [6, 7], drawCombo([1, 2, 3, 8, 9], [6, 10])).level).toBe(8)
    expect(checkPrize(cfg, [1, 2, 3, 4, 5], [6, 7], drawCombo([1, 2, 8, 9, 10], [6, 7])).level).toBe(8)
  })
  it('九等奖 0+2 / 2+1', () => {
    expect(checkPrize(cfg, [1, 2, 3, 4, 5], [6, 7], drawCombo([8, 9, 10, 11, 12], [6, 7])).level).toBe(9)
    expect(checkPrize(cfg, [1, 2, 3, 4, 5], [6, 7], drawCombo([1, 2, 8, 9, 10], [6, 12])).level).toBe(9)
  })
})

describe('qlc 单注兑奖（含特别号）', () => {
  const cfg = GAME_CONFIG.qlc
  it('二等奖 6+1（特别号命中）', () => {
    // 七乐彩：blue 为特别号，draw.blue 即特别号
    const p = checkPrize(cfg, [1, 2, 3, 4, 5, 6, 7], [8], drawCombo([1, 2, 3, 4, 5, 6, 9], [8]))
    expect(p.level).toBe(2)
  })
  it('六等奖 4+1', () => {
    const p = checkPrize(cfg, [1, 2, 3, 4, 5, 6, 7], [8], drawCombo([1, 2, 3, 4, 9, 10, 11], [8]))
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(10)
  })
})

describe('快乐8 兑奖', () => {
  const cfg = GAME_CONFIG.kl8
  it('选十中十 一等奖（浮动）', () => {
    const p = kl8Prize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], drawCombo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [], { firstPrizePerBet: 5000000 }))
    expect(p.level).toBe(1)
    expect(p.match).toBe(10)
    expect(p.bonus).toBe(5000000)
  })
  it('选十中六 固定奖', () => {
    const p = kl8Prize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], drawCombo([1, 2, 3, 4, 5, 6, 30, 40, 50, 60], [], { prizeMap: { x10z6: 5 } }))
    expect(p.match).toBe(6)
    expect(p.bonus).toBe(5)
  })
  it('checkPrize 快乐8 路由', () => {
    const p = checkPrize(cfg, [1, 2, 3, 4, 5], [], drawCombo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [], { prizeMap: { x5z5: 1000 } }))
    expect(p.level).toBe(1)
    expect(p.bonus).toBe(1000)
  })
})

describe('fc3d / pl3 兑奖（直选/组选3/组选6）', () => {
  for (const key of ['fc3d', 'pl3']) {
    const cfg = GAME_CONFIG[key]
    it(`${key} 直选 1040`, () => {
      const p = checkPrizeDirect(cfg, [1, 2, 3], null, drawDirect([1, 2, 3]), 'direct')
      expect(p.level).toBe(1)
      expect(p.bonus).toBe(1040)
    })
    it(`${key} 组选3 346（含对子）`, () => {
      const p = checkPrizeDirect(cfg, [1, 1, 2], null, drawDirect([1, 2, 1]), 'zuxuan3')
      expect(p.level).toBe(2)
      expect(p.bonus).toBe(346)
      // 非对子不构成组选3
      const p2 = checkPrizeDirect(cfg, [1, 2, 3], null, drawDirect([1, 2, 3]), 'zuxuan3')
      expect(p2.level).toBe(0)
    })
    it(`${key} 组选6 173（三不同号）`, () => {
      const p = checkPrizeDirect(cfg, [1, 2, 3], null, drawDirect([3, 1, 2]), 'zuxuan6')
      expect(p.level).toBe(3)
      expect(p.bonus).toBe(173)
      // 对子不构成组选6
      const p2 = checkPrizeDirect(cfg, [1, 1, 2], null, drawDirect([1, 1, 2]), 'zuxuan6')
      expect(p2.level).toBe(0)
    })
    it(`${key} 未中奖`, () => {
      const p = checkPrizeDirect(cfg, [1, 2, 3], null, drawDirect([4, 5, 6]), 'direct')
      expect(p.level).toBe(0)
    })
  }
})

describe('pl5 兑奖', () => {
  const cfg = GAME_CONFIG.pl5
  it('全中 一等奖 100000', () => {
    const p = checkPrizeDirect(cfg, [1, 2, 3, 4, 5], null, drawDirect([1, 2, 3, 4, 5]))
    expect(p.level).toBe(1)
    expect(p.bonus).toBe(100000)
  })
  it('部分命中不中奖', () => {
    const p = checkPrizeDirect(cfg, [1, 2, 3, 4, 5], null, drawDirect([1, 2, 3, 4, 9]))
    expect(p.level).toBe(0)
  })
})

describe('qxc 兑奖（含尾位）', () => {
  const cfg = GAME_CONFIG.qxc
  it('6+尾 一等奖（浮动）', () => {
    const p = checkPrizeDirect(cfg, [1, 2, 3, 4, 5, 6], 7, drawDirect([1, 2, 3, 4, 5, 6], 7, { firstPrizePerBet: 5000000 }))
    expect(p.level).toBe(1)
    expect(p.bonus).toBe(5000000)
  })
  it('6位中但尾不中 → 二等奖', () => {
    const p = checkPrizeDirect(cfg, [1, 2, 3, 4, 5, 6], 7, drawDirect([1, 2, 3, 4, 5, 6], 8, { prizeMap: { '二等奖': 100000 } }))
    expect(p.level).toBe(2)
    expect(p.bonus).toBe(100000)
  })
  it('连续 2 位 → 六等奖 5 元', () => {
    const p = checkPrizeDirect(cfg, [1, 2, 3, 4, 5, 6], 7, drawDirect([1, 2, 9, 9, 9, 9], 7))
    expect(p.level).toBe(6)
    expect(p.bonus).toBe(5)
  })
  it('仅尾位命中 → 未中奖（须连续位）', () => {
    const p = checkPrizeDirect(cfg, [9, 9, 9, 9, 9, 9], 7, drawDirect([1, 2, 3, 4, 5, 6], 7))
    expect(p.level).toBe(0)
  })
})

describe('票兑奖（复式/胆拖/定位复式）', () => {
  it('ssq 复式：包含中奖注，winCount/bonus 正确', () => {
    const cfg = GAME_CONFIG.ssq
    const ticket = { type: 'duplex', red: [1, 2, 3, 4, 5, 6, 7], blue: [7, 8] }
    const draw = drawCombo([1, 2, 3, 4, 5, 6], [7], { firstPrizePerBet: 10000000 })
    const r = checkTicket(cfg, ticket, draw)
    // C(7,6)*2 = 14 注；红 6+蓝 7 → 一等奖；红 5+蓝 7 → 三等奖；蓝 8 注为 6+0/5+0
    expect(r.totalCount).toBe(14)
    expect(r.winCount).toBe(14)
    expect(r.level).toBe(1)
    expect(r.bonus).toBeGreaterThan(0)
  })
  it('ssq 胆拖票兑奖', () => {
    const cfg = GAME_CONFIG.ssq
    const ticket = { type: 'danTuo', danRed: [1, 2], tuoRed: [3, 4, 5, 6, 7], blue: [7] }
    const draw = drawCombo([1, 2, 3, 4, 5, 6], [7], { firstPrizePerBet: 10000000 })
    // C(5,4)=5 注：1 注 6+1 一等奖，4 注 5+1 三等奖
    const r = checkTicket(cfg, ticket, draw)
    expect(r.totalCount).toBe(5)
    expect(r.winCount).toBe(5)
    expect(r.level).toBe(1)
  })
  it('fc3d 定位复式兑奖', () => {
    const cfg = GAME_CONFIG.fc3d
    const ticket = { type: 'duplex', pos: [[1, 2], [2, 3], [3, 4]], zx: 'direct' }
    const draw = drawDirect([1, 2, 3])
    const r = checkTicketDirect(cfg, ticket, draw)
    expect(r.totalCount).toBe(8)
    expect(r.winCount).toBe(1)
    expect(r.level).toBe(1)
  })
  it('dlt 胆拖（后区胆拖）兑奖', () => {
    const cfg = GAME_CONFIG.dlt
    const ticket = { type: 'danTuo', danRed: [1, 2, 3], tuoRed: [4, 5], blueDan: [6], blueTuo: [7, 8] }
    const draw = drawCombo([1, 2, 3, 4, 5], [6, 7])
    const r = checkTicket(cfg, ticket, draw)
    expect(r.totalCount).toBe(2)
    expect(r.winCount).toBeGreaterThan(0)
    expect(r.level).toBeLessThanOrEqual(1)
  })
})

describe('历史追溯核对', () => {
  const cfg = GAME_CONFIG.ssq
  const draws = [
    drawCombo([1, 2, 3, 4, 5, 6], [7], { issue: 'T2026001' }),
    drawCombo([9, 10, 11, 12, 13, 14], [7], { issue: 'T2026002' })
  ]
  it('checkTicketHistory 命中较早一期', () => {
    const r = checkTicketHistory(cfg, { type: 'single', red: [1, 2, 3, 4, 5, 6], blue: [7] }, draws)
    expect(r.winCount).toBe(1)
    expect(r.draw.issue).toBe('T2026001')
  })
  it('checkTicketHistoryMulti 收集全部命中', () => {
    const ticket = { type: 'single', red: [1, 2, 3, 4, 5, 6], blue: [7] }
    const draws2 = [
      drawCombo([1, 2, 3, 4, 5, 6], [7], { issue: 'T1' }),
      drawCombo([9, 10, 11, 12, 13, 14], [8], { issue: 'T2' }),
      drawCombo([1, 2, 3, 4, 5, 6], [7], { issue: 'T3' })
    ]
    const r = checkTicketHistoryMulti(cfg, ticket, draws2)
    expect(r.hitCount).toBe(2)
    expect(r.totalBonus).toBeGreaterThan(0)
    expect(r.hits[0].issue).toBe('T1')
  })
})
