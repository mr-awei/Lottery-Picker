// 中奖判定 / 奖金计算 / 兑奖流程
// 开奖为独立随机事件，以下仅用于中奖结果核对与奖金展示
import { expandTicket } from './picker-engine'

export const PRIZE_RULES = {
  ssq: [
    { red: 6, blue: 1, level: 1, name: '一等奖', fixed: null },
    { red: 6, blue: 0, level: 2, name: '二等奖', fixed: null },
    { red: 5, blue: 1, level: 3, name: '三等奖', fixed: 3000 },
    { red: 5, blue: 0, level: 4, name: '四等奖', fixed: 200 },
    { red: 4, blue: 1, level: 4, name: '四等奖', fixed: 200 },
    { red: 4, blue: 0, level: 5, name: '五等奖', fixed: 10 },
    { red: 3, blue: 1, level: 5, name: '五等奖', fixed: 10 },
    { red: 2, blue: 1, level: 6, name: '六等奖', fixed: 5 },
    { red: 1, blue: 1, level: 6, name: '六等奖', fixed: 5 },
    { red: 0, blue: 1, level: 6, name: '六等奖', fixed: 5 }
  ],
  dlt: [
    { red: 5, blue: 2, level: 1, name: '一等奖', fixed: null },
    { red: 5, blue: 1, level: 2, name: '二等奖', fixed: null },
    { red: 5, blue: 0, level: 3, name: '三等奖', fixed: 10000 },
    { red: 4, blue: 2, level: 4, name: '四等奖', fixed: 3000 },
    { red: 4, blue: 1, level: 5, name: '五等奖', fixed: 300 },
    { red: 3, blue: 2, level: 6, name: '六等奖', fixed: 200 },
    { red: 4, blue: 0, level: 7, name: '七等奖', fixed: 100 },
    { red: 3, blue: 1, level: 8, name: '八等奖', fixed: 15 },
    { red: 2, blue: 2, level: 8, name: '八等奖', fixed: 15 },
    { red: 3, blue: 0, level: 9, name: '九等奖', fixed: 5 },
    { red: 2, blue: 1, level: 9, name: '九等奖', fixed: 5 },
    { red: 1, blue: 2, level: 9, name: '九等奖', fixed: 5 },
    { red: 0, blue: 2, level: 9, name: '九等奖', fixed: 5 }
  ],
  qlc: [
    { red: 7, blue: 0, level: 1, name: '一等奖', fixed: null },
    { red: 6, blue: 1, level: 2, name: '二等奖', fixed: null },
    { red: 6, blue: 0, level: 3, name: '三等奖', fixed: null },
    { red: 5, blue: 1, level: 4, name: '四等奖', fixed: 200 },
    { red: 5, blue: 0, level: 5, name: '五等奖', fixed: 50 },
    { red: 4, blue: 1, level: 6, name: '六等奖', fixed: 10 },
    { red: 4, blue: 0, level: 7, name: '七等奖', fixed: 5 }
  ]
}

/** 快乐8：按玩法（选1~选10）与中奖个数匹配，固定奖金以官方接口 prizeMap 为准 */
export function kl8Prize(chosen, draw) {
  if (!draw) return { level: 0, name: '未开奖', match: 0, bonus: 0, draw: null }
  const n = chosen.length
  const set = new Set(draw.red || [])
  const match = chosen.filter((v) => set.has(v)).length
  const key = 'x' + n + 'z' + match
  if (match === n) {
    return { level: 1, name: `选${n}中${n}`, match, bonus: draw.firstPrizePerBet != null ? draw.firstPrizePerBet : null, draw }
  }
  const fixed = draw.prizeMap && draw.prizeMap[key]
  if (fixed != null && Number(fixed) > 0) {
    return { level: 2, name: `选${n}中${match}`, match, bonus: Number(fixed), draw }
  }
  return { level: 0, name: '未中奖', match, bonus: 0, draw }
}

export function checkPrize(cfg, red, blue, draw, append) {
  if (!draw) return { level: 0, name: '未开奖', redMatch: 0, blueMatch: 0, bonus: 0, draw: null }
  // 快乐8：按选几中几判定（红球即号码池，无蓝）
  if (cfg.kl8) {
    return kl8Prize(red || [], draw)
  }
  const redSet = new Set(draw.red || [])
  const blueList = [draw.blue, draw.blue2].filter((b) => b != null)
  const redMatch = red.filter((n) => redSet.has(n)).length
  const blueMatch = blue.filter((b) => blueList.includes(b)).length
  const rules = PRIZE_RULES[cfg.key] || []
  for (const r of rules) {
    if (redMatch >= r.red && blueMatch >= r.blue) {
      let bonus = r.fixed
      if (r.fixed === null) {
        bonus = draw.firstPrizePerBet != null ? draw.firstPrizePerBet : null
        // 大乐透追加：一/二等奖奖金 ×1.8
        if (append && cfg.zhuijia && bonus != null) bonus = Math.round(bonus * 1.8)
      }
      return { level: r.level, name: r.name, redMatch, blueMatch, bonus, draw, append: !!append }
    }
  }
  return { level: 0, name: '未中奖', redMatch, blueMatch, bonus: 0, draw, append: !!append }
}

export function isBigWin(p) {
  return p && (p.level === 1 || p.level === 2)
}

/** 直位数字型单注判定：3D/排列3（直选/组选3/组选6）、排列5、7星彩（连续匹配+尾位） */
export function checkPrizeDirect(cfg, digits, tail, draw, zx) {
  if (!draw) return { level: 0, name: '未开奖', digitsMatch: 0, tailMatch: false, bonus: 0, draw: null }
  const key = cfg.key
  const dDig = draw.digits || []
  if (key === 'fc3d' || key === 'pl3') {
    const a = digits || []
    const b = dDig
    if (zx === 'direct' && a.length === 3 && a.every((v, i) => v === b[i])) {
      return { level: 1, name: '直选', digitsMatch: 3, tailMatch: false, bonus: 1040, draw }
    }
    const sortedA = [...a].sort((x, y) => x - y).join(',')
    const sortedB = [...b].sort((x, y) => x - y).join(',')
    if (zx === 'zuxuan3' && a.length === 3 && new Set(a).size === 2 && sortedA === sortedB) {
      return { level: 2, name: '组选3', digitsMatch: 3, tailMatch: false, bonus: 346, draw }
    }
    if (zx === 'zuxuan6' && a.length === 3 && new Set(a).size === 3 && sortedA === sortedB) {
      return { level: 3, name: '组选6', digitsMatch: 3, tailMatch: false, bonus: 173, draw }
    }
    return { level: 0, name: '未中奖', digitsMatch: 0, tailMatch: false, bonus: 0, draw }
  }
  if (key === 'pl5') {
    const a = digits || []
    const ok = a.length === 5 && a.every((v, i) => v === dDig[i])
    return ok
      ? { level: 1, name: '一等奖', digitsMatch: 5, tailMatch: false, bonus: 100000, draw }
      : { level: 0, name: '未中奖', digitsMatch: 0, tailMatch: false, bonus: 0, draw }
  }
  if (key === 'qxc') {
    const a = digits || []
    let m = 0
    for (let i = 0; i < 6; i++) {
      if (a[i] === dDig[i]) m++
      else break
    }
    const tailOk = tail != null && draw.tail != null && tail === draw.tail
    if (m === 6 && tailOk) {
      return { level: 1, name: '一等奖', digitsMatch: 6, tailMatch: true, bonus: draw.firstPrizePerBet != null ? draw.firstPrizePerBet : null, draw }
    }
    if (m === 6) {
      const b2 = draw.prizeMap && draw.prizeMap['二等奖'] != null ? Number(draw.prizeMap['二等奖']) : null
      return { level: 2, name: '二等奖', digitsMatch: 6, tailMatch: false, bonus: b2, draw }
    }
    if (m === 5) return { level: 3, name: '三等奖', digitsMatch: 5, tailMatch: false, bonus: 3000, draw }
    if (m === 4) return { level: 4, name: '四等奖', digitsMatch: 4, tailMatch: false, bonus: 500, draw }
    if (m === 3) return { level: 5, name: '五等奖', digitsMatch: 3, tailMatch: false, bonus: 30, draw }
    if (m === 2) return { level: 6, name: '六等奖', digitsMatch: 2, tailMatch: false, bonus: 5, draw }
    return { level: 0, name: '未中奖', digitsMatch: 0, tailMatch: false, bonus: 0, draw }
  }
  return { level: 0, name: '未中奖', digitsMatch: 0, tailMatch: false, bonus: 0, draw }
}

/** 直位票逐注核对（支持单注/多注/定位复式展开） */
export function checkTicketDirect(cfg, ticket, draw) {
  if (!draw) {
    return { level: 0, name: '未开奖', bonus: 0, winCount: 0, totalCount: 0, lines: [], draw: null, best: null }
  }
  const lines = expandTicket(cfg, ticket)
  const multiple = Math.max(1, Math.min(99, (ticket && ticket.multiple) || 1))
  const results = lines.map((l) => {
    const prize = checkPrizeDirect(cfg, l.digits, l.tail, draw, l.zx)
    if (prize.bonus && multiple > 1) prize.bonus = prize.bonus * multiple
    return { digits: l.digits, tail: l.tail, zx: l.zx, prize }
  })
  let best = null
  let bonus = 0
  let winCount = 0
  results.forEach((r) => {
    if (r.prize.level > 0) {
      winCount++
      bonus += r.prize.bonus || 0
      if (!best || r.prize.level < best.level) best = r.prize
    }
  })
  return {
    level: best ? best.level : 0,
    name: best ? best.name : '未中奖',
    bonus,
    winCount,
    totalCount: results.length,
    lines: results,
    draw,
    best
  }
}

/**
 * 对任意玩法票（单注/多注/复式/胆拖）展开后逐注核对中奖。
 * ticket 结构见 picker-engine.js 的 expandTicket。
 * 返回：{ level, name, bonus, winCount, totalCount, lines, draw, best }
 */
export function checkTicket(cfg, ticket, draw) {
  if (!draw) {
    return { level: 0, name: '未开奖', bonus: 0, winCount: 0, totalCount: 0, lines: [], draw: null, best: null }
  }
  if (cfg.playMode === 'direct') {
    return checkTicketDirect(cfg, ticket, draw)
  }
  const lines = expandTicket(cfg, ticket)
  const append = !!(ticket && ticket.append)
  const multiple = Math.max(1, Math.min(99, (ticket && ticket.multiple) || 1))
  const results = lines.map((l) => {
    const prize = checkPrize(cfg, l.red, l.blue, draw, append)
    // 倍数投注：单注奖金 × 倍数
    if (prize.bonus && multiple > 1) prize.bonus = prize.bonus * multiple
    return { red: l.red, blue: l.blue, prize }
  })
  let best = null
  let bonus = 0
  let winCount = 0
  results.forEach((r) => {
    if (r.prize.level > 0) {
      winCount++
      bonus += r.prize.bonus || 0
      if (!best || r.prize.level < best.level) best = r.prize
    }
  })
  return {
    level: best ? best.level : 0,
    name: best ? best.name : '未中奖',
    bonus,
    winCount,
    totalCount: results.length,
    lines: results,
    draw,
    best
  }
}

/** 大奖兑奖流程（一二等奖） */
export function bigWinFlow(cfg, prize) {
  const center = isFucai(cfg) ? '省级福利彩票发行中心' : '省级体育彩票管理中心'
  return [
    '恭喜您中得' + prize.name + '！请按以下流程完成兑奖：',
    '',
    `1. 保管彩票：中奖彩票是唯一兑奖凭证，立即在彩票背面空白处签名，保持票面完整、无涂改、无折叠破损。`,
    `2. 携带证件：本人有效身份证件原件 + 中奖彩票原件。`,
    `3. 兑奖地点：前往${center}办理（中奖地所在省份），一二等奖须到省级中心兑付。`,
    `4. 兑奖期限：自开奖之日起 60 个自然日内，逾期未兑视为弃奖。`,
    `5. 缴纳税费：单注奖金超过 1 万元的部分按 20% 缴纳个人偶然所得税，由兑奖机构代扣代缴。`,
    `6. 奖金到账：核对无误后，奖金扣除个税后通过转账或支票支付。`,
    '',
    '温馨提示：请勿向陌生人透露中奖信息，谨防电信诈骗；兑奖全程可要求工作人员出示工作证件。'
  ].join('\n')
}

/** 小额中奖提示（三~六/九等奖）：结构化兑奖流程（可被 buildFlowData 解析为步骤） */
export function smallWinNote(cfg, prize) {
  const center = isFucai(cfg) ? '福彩投注站' : '体彩投注站'
  const over3000 = prize.fixed != null ? prize.fixed : (prize.bonus || 0)
  return [
    `恭喜中得${prize.name}（奖金 ¥${fmtBonus(prize.bonus)}）。请按以下流程完成兑奖：`,
    '',
    `1. 保管彩票：中奖彩票是唯一兑奖凭证，立即在彩票背面空白处签名，保持票面完整、无涂改、无折叠破损。`,
    `2. 兑奖地点：凭中奖彩票原件在${center}直接兑付；如投注站无法兑付，请前往当地市级彩票中心办理。`,
    `3. 兑奖期限：自开奖之日起 60 个自然日内，逾期未兑视为弃奖。`,
    `4. 奖金支付：${over3000 > 3000 ? '3000 元以上奖金需携带本人有效身份证件办理，1 万元以上部分按 20% 代扣个人偶然所得税。' : '单注奖金 3000 元及以下由兑付点直接支付现金或转账。'}`,
    '',
    '温馨提示：请勿向陌生人透露中奖信息，谨防电信诈骗。'
  ].join('\n')
}

export function fmtBonus(n) {
  if (n == null || isNaN(n)) return '浮动待定'
  if (n >= 100000000) return (n / 100000000).toFixed(2) + ' 亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  return String(n)
}

/** 福彩/体彩归属：福彩=双色球/七乐彩/福彩3D，体彩=大乐透/快乐8/排列3/排列5/7星彩 */
export function isFucai(cfg) {
  const k = cfg && cfg.key
  return k === 'ssq' || k === 'qlc' || k === 'fc3d'
}

/**
 * 单注自动追溯核对：从最近一期往前遍历 draws（按传入顺序），
 * 一旦某期命中即返回该期中奖结果；全部未命中则用最新一期返回未中奖。
 * 适合"以前买的票"场景——最新一期查不到就自动往前查。
 */
export function checkPrizeHistory(cfg, red, blue, draws, append) {
  if (!draws || !draws.length) return checkPrize(cfg, red, blue, null)
  for (const d of draws) {
    const p = checkPrize(cfg, red, blue, d, append)
    if (p.level > 0) return p
  }
  return checkPrize(cfg, red, blue, draws[0], append)
}

/** 直位单注自动追溯核对 */
export function checkPrizeDirectHistory(cfg, digits, tail, draws, zx) {
  if (!draws || !draws.length) return checkPrizeDirect(cfg, digits, tail, null, zx)
  for (const d of draws) {
    const p = checkPrizeDirect(cfg, digits, tail, d, zx)
    if (p.level > 0) return p
  }
  return checkPrizeDirect(cfg, digits, tail, draws[0], zx)
}

/**
 * 任意玩法票自动追溯核对：从最近一期往前遍历，一旦某期有任意一注中奖即返回；
 * 全部未命中则用最新一期返回未中奖结果。
 */
export function checkTicketHistory(cfg, ticket, draws) {
  if (!draws || !draws.length) return checkTicket(cfg, ticket, null)
  for (const d of draws) {
    const r = checkTicket(cfg, ticket, d)
    if (r.winCount > 0) return r
  }
  return checkTicket(cfg, ticket, draws[0])
}

/** 从开奖数据中提取一等奖中奖省份列表（兼容字符串与 {province} 对象两种结构） */
function extractProvinces(draw) {
  const w = draw && draw.winners
  if (!Array.isArray(w) || !w.length) return []
  const set = new Set()
  for (const item of w) {
    const p = typeof item === 'string' ? item : item && item.province
    if (p) set.add(String(p))
  }
  return [...set]
}

/**
 * 任意玩法票多期追溯核对：遍历 draws 全部开奖期，收集所有命中记录。
 * 用于自选号历史记录展示"号码多次中奖"的期数 / 金额 / 省份 / 奖金总额。
 * 返回：{ hits: [{ issue, date, level, name, bonus, winCount, provinceText }], hitCount, totalBonus }
 */
export function checkTicketHistoryMulti(cfg, ticket, draws) {
  if (!draws || !draws.length) return { hits: [], hitCount: 0, totalBonus: 0 }
  const hits = []
  let totalBonus = 0
  for (const d of draws) {
    const r = checkTicket(cfg, ticket, d)
    if (r.winCount > 0) {
      const provinces = extractProvinces(d)
      const provinceText =
        r.level === 1 && provinces.length
          ? provinces.length > 3
            ? provinces.slice(0, 3).join('、') + ` 等${provinces.length}省`
            : provinces.join('、')
          : '—'
      hits.push({
        issue: d.issue,
        date: d.date,
        level: r.level,
        name: r.name,
        bonus: r.bonus,
        winCount: r.winCount,
        provinceText
      })
      totalBonus += r.bonus || 0
    }
  }
  return { hits, hitCount: hits.length, totalBonus }
}
