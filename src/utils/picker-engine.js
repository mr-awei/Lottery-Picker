// 本地统计选号引擎：冷热号加权 + 区间均衡 + 奇偶均衡 + 和值区间 + 连号限量
// 输入近 100 期开奖数据，输出 n 注推荐号码及各维度得分
// 声明：彩票为独立随机事件，本引擎仅基于历史统计生成参考组合，不提高中奖概率

// GPU 加速批量引擎（WebGPU 主方案，逐级降级 GPU.js/Worker/CPU；generateUntil 等旧接口保持兼容）
import { runBatch, getGPUState, scoreCandidates } from './gpu-engine'

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function range(n) {
  const a = new Array(n)
  for (let i = 0; i < n; i++) a[i] = i + 1
  return a
}

/** Fisher-Yates 无偏采样 k 个（替代 splice 有偏洗牌，O(n)） */
function randPick(arr, k) {
  const a = [...arr]
  const n = Math.min(k, a.length)
  for (let i = 0; i < n; i++) {
    const j = randInt(i, a.length - 1)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a.slice(0, n)
}

/**
 * 加权池无重复采样：池中含重复权重元素（热号出现多次），
 * 洗牌过程中跳过已取号码，一次遍历取满 k 个不同号码，避免无效重试。
 */
function randPickUnique(pool, k) {
  const a = [...pool]
  const n = a.length
  const picked = []
  const seen = new Set()
  for (let i = 0; i < n && picked.length < k; i++) {
    const j = randInt(i, n - 1)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
    if (!seen.has(a[i])) {
      seen.add(a[i])
      picked.push(a[i])
    }
  }
  return picked
}

/** 用户锁定号码规范化：过滤非法值、去重、升序。max 为号码上限 */
export function normLocked(max, locked) {
  if (!Array.isArray(locked) || !locked.length) return []
  const seen = new Set()
  const out = []
  for (const n of locked) {
    const v = Number(n)
    if (!Number.isInteger(v) || v < 1 || v > max || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out.sort((a, b) => a - b)
}

/** 组合数 C(n, k) */
export function comb(n, k) {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/** 统计近 N 期冷热/遗漏（独立导出供自选号评分复用） */
export function computeStats(cfg, draws) {
  const redFreq = new Array(cfg.redMax + 1).fill(0)
  const redMiss = new Array(cfg.redMax + 1).fill(-1)
  const blueFreq = new Array(cfg.blueMax + 1).fill(0)
  const blueMiss = new Array(cfg.blueMax + 1).fill(-1)
  const tailFreq = new Array(10).fill(0)
  const total = draws.length

  for (let idx = 0; idx < total; idx++) {
    const d = draws[idx]
    const red = d.red || []
    for (let i = 0; i < red.length; i++) {
      const n = red[i]
      if (n >= 1 && n <= cfg.redMax) {
        redFreq[n]++
        redMiss[n] = idx
        tailFreq[n % 10]++
      }
    }
    const b1 = d.blue
    if (b1 >= 1 && b1 <= cfg.blueMax) {
      blueFreq[b1]++
      blueMiss[b1] = idx
    }
    const b2 = d.blue2
    if (b2 != null && b2 >= 1 && b2 <= cfg.blueMax) {
      blueFreq[b2]++
      blueMiss[b2] = idx
    }
  }

  const recent = draws.slice(0, Math.min(10, total))
  const hotSet = new Set()
  for (const d of recent) {
    const red = d.red || []
    for (let i = 0; i < red.length; i++) {
      const n = red[i]
      if (redFreq[n] >= 3) hotSet.add(n)
    }
  }
  const hot = [...hotSet]

  const cold = []
  for (let n = 1; n <= cfg.redMax; n++) {
    const miss = redMiss[n] === -1 ? total : total - redMiss[n]
    if (miss >= 10) cold.push(n)
  }

  const hotBlue = new Set()
  for (const d of recent) {
    if (d.blue != null) hotBlue.add(d.blue)
    if (d.blue2 != null) hotBlue.add(d.blue2)
  }

  const first = draws[0] || {}
  const lastRed = (first.red || []).filter((n) => n >= 1 && n <= cfg.redMax)
  const lastBlue = []
  if (first.blue != null && first.blue >= 1 && first.blue <= cfg.blueMax) lastBlue.push(first.blue)
  if (first.blue2 != null && first.blue2 >= 1 && first.blue2 <= cfg.blueMax) lastBlue.push(first.blue2)

  // 每个号码的遗漏期数（0 = 上期刚出）
  const omitVal = []
  for (let n = 1; n <= cfg.redMax; n++) {
    omitVal[n] = redMiss[n] === -1 ? total : total - redMiss[n]
  }
  const blueOmit = []
  for (let b = 1; b <= cfg.blueMax; b++) {
    blueOmit[b] = blueMiss[b] === -1 ? total : total - blueMiss[b]
  }

  // 近 5 期红球和值均值（均值回归策略用）
  const sumRecentArr = draws.slice(0, Math.min(5, total))
  const sumRecent = sumRecentArr.length
    ? sumRecentArr.reduce((acc, d) => acc + (d.red || []).reduce((a, b) => a + b, 0), 0) / sumRecentArr.length
    : 0

  return { redFreq, redMiss, blueFreq, blueMiss, hot, cold, hotBlue, total, lastRed, lastBlue, tailFreq, omitVal, blueOmit, sumRecent }
}

/** 质数集合（双色球/大乐透红球共用） */
const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31])

/** 红球结构评分（独立导出） */
export function scoreRed(cfg, red, s) {
  const zones = [0, 0, 0]
  red.forEach((n) => {
    const z = n <= cfg.zoneEdges[0] ? 0 : n <= cfg.zoneEdges[1] ? 1 : 2
    zones[z]++
  })
  let zoneScore = 0
  cfg.zoneTarget.forEach((t, i) => {
    zoneScore += Math.max(0, 1 - Math.abs(zones[i] - t) / t)
  })
  zoneScore = (zoneScore / cfg.zoneTarget.length) * 100

  const odds = red.filter((n) => n % 2 === 1).length
  const targetOdd = Math.round(cfg.redCount / 2)
  const oddScore = Math.max(0, 100 - Math.abs(odds - targetOdd) * 25)

  const sum = red.reduce((a, b) => a + b, 0)
  const mid = (cfg.sumMin + cfg.sumMax) / 2
  const sumScore = Math.max(0, 100 - (Math.abs(sum - mid) / (cfg.sumMax - cfg.sumMin)) * 220)

  const sorted = [...red].sort((a, b) => a - b)
  let cons = 0
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] === 1) cons++
  const consScore = cons <= 1 ? 100 : Math.max(0, 100 - (cons - 1) * 45)

  const hotIn = red.filter((n) => s.hot.includes(n)).length
  const coldIn = red.filter((n) => s.cold.includes(n)).length
  const hotScore = Math.min(100, hotIn * 25 + coldIn * 10)

  // 大小比：大号(>sizeSplit)个数接近目标
  const sizeSplit = cfg.sizeSplit || Math.floor(cfg.redMax / 2)
  const bigs = red.filter((n) => n > sizeSplit).length
  const targetBig = Math.round(cfg.redCount / 2)
  const sizeScore = Math.max(0, 100 - Math.abs(bigs - targetBig) * 30)

  // 质合比：质数个数接近 2
  const primes = red.filter((n) => PRIMES.has(n)).length
  const primeScore = Math.max(0, 100 - Math.abs(primes - 2) * 28)

  // 012路均衡：按 n%3 分三路，偏离均分惩罚
  const routes = [0, 0, 0]
  red.forEach((n) => routes[n % 3]++)
  const perRoute = cfg.redCount / 3
  const routeScore = Math.max(0, 100 - routes.reduce((a, c) => a + Math.abs(c - perRoute), 0) * 22)

  // 跨度：max-min 落在常见区间
  const span = sorted[sorted.length - 1] - sorted[0]
  const spanMin = cfg.spanMin != null ? cfg.spanMin : 16
  const spanMax = cfg.spanMax != null ? cfg.spanMax : 30
  const spanScore = span >= spanMin && span <= spanMax ? 100 : Math.max(0, 100 - Math.min(60, Math.abs(span - (spanMin + spanMax) / 2) * 6))

  // 尾数分散：重复尾数惩罚
  const tails = new Array(10).fill(0)
  red.forEach((n) => tails[n % 10]++)
  const tailPairs = tails.reduce((a, c) => a + Math.max(0, c - 1), 0)
  const tailScore = Math.max(0, 100 - tailPairs * 22)

  // 重号：与上期重复 1~2 个最自然
  let reps = 0
  if (s.lastRed && s.lastRed.length) red.forEach((n) => { if (s.lastRed.includes(n)) reps++ })
  const repeatScore = reps <= 2 ? 100 : reps === 3 ? 70 : Math.max(0, 100 - reps * 18)

  // 遗漏回补：包含适当数量的中遗漏号码（3~15 期未出）
  const omitOk = red.filter((n) => s.omitVal[n] >= 3 && s.omitVal[n] <= 15).length
  const omitScore = omitOk >= 2 ? 100 : omitOk === 1 ? 75 : 55

  // AC值（算术复杂度）：独特两两差值数 - (k-1)，适中区间加分
  const diffSet = new Set()
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) diffSet.add(sorted[j] - sorted[i])
  const ac = diffSet.size - (sorted.length - 1)
  const acScore = ac >= 5 && ac <= 10 ? 100 : Math.max(0, 100 - Math.abs(ac - 7) * 12)

  // 邻号参照：与上期号码 ±1 的邻号命中 1~2 个最自然（老彩民"补位定胆"）
  const neighborSet = new Set()
  if (s.lastRed && s.lastRed.length) {
    s.lastRed.forEach((n) => { neighborSet.add(n - 1); neighborSet.add(n + 1) })
  }
  const neighborIn = red.filter((n) => neighborSet.has(n)).length
  const neighborScore = neighborIn === 2 ? 100 : neighborIn === 1 ? 90 : neighborIn === 0 ? 60 : Math.max(0, 100 - (neighborIn - 2) * 25)

  // 黄金分割：号码接近 redMax×0.382 / ×0.618 基点（动态适配双色球33/大乐透35）
  const g1 = Math.round(cfg.redMax * 0.382)
  const g2 = Math.round(cfg.redMax * 0.618)
  const goldenIn = red.filter((n) => Math.abs(n - g1) <= 2 || Math.abs(n - g2) <= 2).length
  const goldenScore = goldenIn >= 1 && goldenIn <= 2 ? 100 : goldenIn > 2 ? 80 : 60

  // 镜像对称：恒值对码（redMax+1-n）同出惩罚，避免全镜像畸形组合
  const mirrorVal = cfg.redMax + 1
  const redSet = new Set(red)
  let mirrorPairs = 0
  red.forEach((n) => {
    const p = mirrorVal - n
    if (p !== n && p >= 1 && p <= cfg.redMax && redSet.has(p)) mirrorPairs++
  })
  mirrorPairs = Math.floor(mirrorPairs / 2)
  const mirrorScore = mirrorPairs === 0 ? 100 : Math.max(0, 100 - mirrorPairs * 45)

  // 和值尾数：个位落 3~7 中段最常见
  const sumTail = sum % 10
  const sumTailScore = sumTail >= 3 && sumTail <= 7 ? 100 : sumTail === 0 || sumTail === 8 || sumTail === 9 ? 80 : 70

  // 均值回归：和值贴近近 5 期平均
  const meanScore = s.sumRecent != null && s.sumRecent > 0 ? Math.max(0, 100 - Math.min(60, (Math.abs(sum - s.sumRecent) / 15) * 100)) : 80

  // 斐波那契遗漏周期：遗漏值接近 8/13/21 的号码进入补号池
  const fiboHits = red.filter((n) => {
    const o = s.omitVal[n]
    return (o >= 7 && o <= 9) || (o >= 12 && o <= 14) || (o >= 20 && o <= 22)
  }).length
  const fiboScore = fiboHits >= 2 ? 100 : fiboHits === 1 ? 85 : 65

  // 龙头凤尾：龙头偏小、凤尾偏大的常见区间
  const headOk = sorted[0] <= (cfg.redMax <= 33 ? 9 : 11)
  const tailOk = sorted[sorted.length - 1] >= 28
  const headTailScore = headOk && tailOk ? 100 : headOk || tailOk ? 80 : 55

  // 夹号定位：落在上期任意两号之间的号码（0~1 个自然）
  // 注意：上期号码统一排序后判断，与 gpu-engine scoreRedCPU 保持一致
  const clampHits = red.filter((n) => {
    const lr2 = (s.lastRed || []).slice().sort((a, b) => a - b)
    if (lr2.length < 2) return false
    for (let i = 0; i < lr2.length - 1; i++) {
      if (lr2[i + 1] - lr2[i] > 1 && n > lr2[i] && n < lr2[i + 1]) return true
    }
    return false
  }).length
  const clampScore = clampHits <= 1 ? 100 : Math.max(0, 100 - (clampHits - 1) * 35)

  const total = Math.round(
    zoneScore * 0.1 + oddScore * 0.08 + sumScore * 0.09 + consScore * 0.05 + hotScore * 0.08 +
    sizeScore * 0.08 + primeScore * 0.04 + routeScore * 0.06 + spanScore * 0.04 + tailScore * 0.04 +
    repeatScore * 0.04 + omitScore * 0.03 + acScore * 0.02 + neighborScore * 0.04 + goldenScore * 0.03 +
    mirrorScore * 0.02 + sumTailScore * 0.03 + meanScore * 0.04 + fiboScore * 0.02 + headTailScore * 0.04 + clampScore * 0.03
  )
  // 21 分项数组，顺序与 gpu-engine 的 RED_W 权重一一对应
  const parts = [zoneScore, oddScore, sumScore, consScore, hotScore, sizeScore, primeScore, routeScore, spanScore, tailScore, repeatScore, omitScore, acScore,
    neighborScore, goldenScore, mirrorScore, sumTailScore, meanScore, fiboScore, headTailScore, clampScore]
  return { zones, odds, sum, cons, hotIn, coldIn, bigs, primes, routes, span, tailPairs, reps, omitOk, ac,
    neighborIn, goldenIn, mirrorPairs, sumTail, meanScore, fiboHits, headOk, tailOk, clampHits,
    zoneScore, oddScore, sumScore, consScore, hotScore, sizeScore, primeScore, routeScore, spanScore, tailScore, repeatScore, omitScore, acScore,
    neighborScore, goldenScore, mirrorScore, sumTailScore, meanScore, fiboScore, headTailScore, clampScore, parts, total }
}

/** 蓝球评分：热号 + 大小 + 012路 + 遗漏（无蓝球彩种返回 0 分） */
export function scoreBlue(cfg, blue, s) {
  if (!blue || !blue.length) return { hotIn: 0, hotScore: 0, sizeScore: 0, routeScore: 0, omitScore: 0, total: 0 }
  const hotIn = blue.filter((b) => s.hotBlue.has(b)).length
  const hotScore = Math.min(100, 40 + hotIn * 30)
  // 大乐透双蓝：一大一小偏好
  let sizeScore = 100
  if (blue.length > 1) {
    const split = cfg.blueSizeSplit || Math.floor(cfg.blueMax / 2)
    const bigs = blue.filter((b) => b > split).length
    const target = Math.round(blue.length / 2)
    sizeScore = Math.max(0, 100 - Math.abs(bigs - target) * 35)
  }
  // 012路分散
  let routeScore = 100
  if (blue.length > 1) {
    const routes = [0, 0, 0]
    blue.forEach((b) => routes[b % 3]++)
    const uniq = routes.filter((c) => c > 0).length
    routeScore = uniq >= blue.length ? 100 : Math.max(0, 100 - (blue.length - uniq) * 30)
  }
  // 遗漏适度（避免全热或全冷）
  const omitAvg = blue.reduce((a, b) => a + (s.blueOmit[b] != null ? s.blueOmit[b] : 5), 0) / blue.length
  const omitScore = omitAvg >= 2 && omitAvg <= 20 ? 100 : Math.max(0, 100 - Math.abs(omitAvg - 8) * 4)
  const total = Math.round(hotScore * 0.5 + sizeScore * 0.2 + routeScore * 0.15 + omitScore * 0.15)
  return { hotIn, hotScore, sizeScore, routeScore, omitScore, total }
}

/** 对单注号码按与引擎相同规则评分。s 可选：外部已算好的 computeStats 结果，避免重复统计 */
export function scoreTicket(cfg, draws, red, blue, s) {
  if (!draws || !draws.length) return { total: 0, zones: [0, 0, 0], odds: 0, sum: 0, cons: 0, hotIn: 0, coldIn: 0, blueHot: 0 }
  const st = s || computeStats(cfg, draws)
  const rs = scoreRed(cfg, red, st)
  const bs = scoreBlue(cfg, blue || [], st)
  return { ...rs, blueHot: (blue || []).filter((b) => st.hotBlue.has(b)).length, blueScore: bs, stats: st }
}

/** 玩法定义 */
export const PLAY_TYPES = [
  { key: 'single', label: '单注', price: 2 },
  { key: 'multi', label: '多注', price: 2 },
  { key: 'duplex', label: '复式', price: 2 },
  { key: 'danTuo', label: '胆拖', price: 2 }
]

export const UNIT_PRICE = 2

/** 可选生成策略（方法）：覆盖经典冷热统计与老彩民经验型方法（21 种） */
export const ALL_METHODS = ['zone', 'odd', 'sum', 'cons', 'hot', 'size', 'prime', 'route', 'span', 'tail', 'repeat', 'omit', 'ac', 'neighbor', 'golden', 'mirror', 'sumTail', 'mean', 'fibo', 'headTail', 'clamp']
export const METHOD_LABELS = {
  zone: '区间均衡',
  odd: '奇偶均衡',
  sum: '和值区间',
  cons: '连号控制',
  hot: '冷热倾向',
  size: '大小均衡',
  prime: '质合配比',
  route: '012路均衡',
  span: '跨度优选',
  tail: '尾数分散',
  repeat: '重号参照',
  omit: '遗漏回补',
  ac: 'AC值优选',
  neighbor: '邻号参照',
  golden: '黄金分割',
  mirror: '镜像对称',
  sumTail: '和值尾数',
  mean: '均值回归',
  fibo: '斐波那契',
  headTail: '龙头凤尾',
  clamp: '夹号定位'
}

/** 归一化策略：不传=全部策略；传空数组=真随机（不用任何策略） */
export function normMethods(methods) {
  if (methods === undefined || methods === null) return ALL_METHODS
  if (!Array.isArray(methods) || !methods.length) return []
  const set = new Set(methods.filter((x) => ALL_METHODS.includes(x)))
  return ALL_METHODS.filter((x) => set.has(x))
}

/** 按选中策略归一化权重计算总分（只选部分策略时用于择优）。sc 可选：外部已算好的 scoreRed 结果 */
export function weightedScore(cfg, red, s, methods, sc) {
  const W = { zone: 0.1, odd: 0.08, sum: 0.09, cons: 0.05, hot: 0.08, size: 0.08, prime: 0.04, route: 0.06, span: 0.04, tail: 0.04, repeat: 0.04, omit: 0.03, ac: 0.02, neighbor: 0.04, golden: 0.03, mirror: 0.02, sumTail: 0.03, mean: 0.04, fibo: 0.02, headTail: 0.04, clamp: 0.03 }
  let wsum = 0
  methods.forEach((m) => { wsum += W[m] || 0 })
  if (!wsum) return 0
  const st = sc || scoreRed(cfg, red, s)
  let total = 0
  methods.forEach((m) => { total += st[m + 'Score'] * ((W[m] || 0) / wsum) })
  return Math.round(total)
}

/** 计算玩法注数与金额。play 形如：
 *  single: {}
 *  multi: { n: 3 }
 *  duplex: { redCount: 7, blueCount: 2 }
 *  danTuo: { danRed: [2], tuoRed: [6], blue: [2] }  （red 数组展开计算）
 *  大乐透追加（cfg.zhuijia && play.append）时每注 +1 元
 */
export function calcPlay(cfg, play) {
  // 直位数字型（福彩3D/排列3/排列5/7星彩）：定位复式/多注/单注
  if (cfg.playMode === 'direct') {
    return calcDirectPlay(cfg, play)
  }
  const type = play ? play.type : 'single'
  let combos = 0
  if (type === 'single') combos = 1
  else if (type === 'multi') combos = Math.max(1, play.n || 1)
  else if (type === 'duplex') {
    // 兼容两种入参：玩法配置（redCount/blueCount）或实际票（red/blue 数组）
    const r = Array.isArray(play.red) ? play.red.length : (play.redCount || cfg.redCount + 1)
    const b = Array.isArray(play.blue) ? play.blue.length : (play.blueCount || cfg.blueCount)
    combos = comb(r, cfg.redCount) * comb(b, cfg.blueCount)
  } else if (type === 'danTuo') {
    const dan = Array.isArray(play.danRed) ? play.danRed.length : 0
    const tuo = Array.isArray(play.tuoRed) ? play.tuoRed.length : 0
    if (dan >= cfg.redCount || tuo <= 0) {
      combos = 0
    } else {
      const redCombos = comb(tuo, cfg.redCount - dan)
      // 后区胆拖（大乐透）：蓝球由 blueDan 固定 + 组合(blueTuo, blueCount - blueDan.length) 构成
      const blueDan = Array.isArray(play.blueDan) ? play.blueDan.length : 0
      const blueTuo = Array.isArray(play.blueTuo) ? play.blueTuo.length : 0
      if (blueDan > 0 && blueTuo >= cfg.blueCount - blueDan && blueDan < cfg.blueCount) {
        combos = redCombos * comb(blueTuo, cfg.blueCount - blueDan)
      } else {
        const b = Array.isArray(play.blue) ? play.blue.length : cfg.blueCount
        combos = redCombos * comb(b, cfg.blueCount)
      }
    }
  }
  const append = !!(cfg.zhuijia && play && play.append)
  const multiple = Math.max(1, Math.min(99, (play && play.multiple) || 1))
  const price = append ? UNIT_PRICE + (cfg.zhuijiaPrice || 1) : UNIT_PRICE
  return { combos, amount: combos * price * multiple, append, multiple }
}

/** 组合枚举（k<0 或 k>n 时安全返回空；k=0 返回一个空组合，用于无蓝球乐透型复式/胆拖） */
function combosOf(arr, k) {
  const n = arr.length
  if (k < 0 || k > n) return []
  if (k === 0) return [[]]
  const out = []
  const idx = Array.from({ length: k }, (_, i) => i)
  while (true) {
    out.push(idx.map((i) => arr[i]))
    let p = k - 1
    while (p >= 0 && idx[p] === n - k + p) p--
    if (p < 0) break
    idx[p]++
    for (let i = p + 1; i < k; i++) idx[i] = idx[i - 1] + 1
  }
  return out
}

/** 把任意玩法票展开为单注数组 */
export function expandTicket(cfg, ticket) {
  if (!ticket || typeof ticket !== 'object') return []
  // 直位数字型：展开为 { digits, tail, zx } 单注
  if (cfg.playMode === 'direct') {
    return expandDirectTicket(cfg, ticket)
  }
  const type = ticket.type || 'single'
  const out = []
  if (type === 'single') {
    out.push({ red: [...(ticket.red || [])], blue: [...(ticket.blue || [])] })
  } else if (type === 'multi') {
    ;(ticket.tickets || []).forEach((t) => out.push({ red: [...t.red], blue: [...t.blue] }))
  } else if (type === 'duplex') {
    const reds = [...(ticket.red || [])].sort((a, b) => a - b)
    const blues = [...(ticket.blue || [])].sort((a, b) => a - b)
    combosOf(reds, cfg.redCount).forEach((r) => {
      combosOf(blues, cfg.blueCount).forEach((b) => out.push({ red: r, blue: b }))
    })
  } else if (type === 'danTuo') {
    const dan = [...(ticket.danRed || [])].sort((a, b) => a - b)
    const tuo = [...(ticket.tuoRed || [])].sort((a, b) => a - b)
    const blues = [...(ticket.blue || [])].sort((a, b) => a - b)
    const blueDan = [...(ticket.blueDan || [])].sort((a, b) => a - b)
    const blueTuo = [...(ticket.blueTuo || [])].sort((a, b) => a - b)
    // 后区胆拖（大乐透）：blueDan 固定 + 组合(blueTuo)
    let blueCombos = []
    if (blueDan.length > 0 && blueTuo.length >= cfg.blueCount - blueDan.length && blueDan.length < cfg.blueCount) {
      blueCombos = combosOf(blueTuo, cfg.blueCount - blueDan.length).map((t) =>
        [...blueDan, ...t].sort((a, b) => a - b)
      )
    } else {
      blueCombos = combosOf(blues, cfg.blueCount)
    }
    combosOf(tuo, cfg.redCount - dan.length).forEach((t) => {
      blueCombos.forEach((b) => {
        out.push({ red: [...dan, ...t].sort((a, b) => a - b), blue: b })
      })
    })
  }
  return out
}

/** 对任意玩法票评分：展开所有单注分别评分，取平均分；附带最高分与最低分。s 可选：预计算 stats */
export function scoreTicketPlay(cfg, draws, ticket, s) {
  const lines = expandTicket(cfg, ticket)
  if (!lines.length) return { total: 0, lines: [], count: 0 }
  const st = s || (draws && draws.length ? computeStats(cfg, draws) : null)
  const scored = lines.map((l) => ({
    ...l,
    score: st ? scoreTicket(cfg, draws, l.red, l.blue, st) : { total: 0 }
  }))
  const avg = scored.reduce((a, x) => a + (x.score.total || 0), 0) / scored.length
  const totals = scored.map((x) => x.score.total || 0)
  return {
    total: Math.round(avg),
    max: Math.round(Math.max(...totals)),
    min: Math.round(Math.min(...totals)),
    lines: scored,
    count: scored.length,
    stats: st
  }
}

/**
 * 加权池采样择优：从 pool 中随机取 k 个，满足约束则计分，多轮尝试取最高分。
 * opts: { forbidCold, strict, tries }
 *  - strict=true（单注/多注）：第一轮应用 和值/连号/区间 硬约束；不足 92 分时第二轮放宽约束继续择优
 *  - strict=false（复式/胆拖）：号码较多时区间约束不适用，直接按策略权重择优
 */
function pickBest(cfg, s, pool, k, m, opts) {
  const { forbidCold = false, strict = true, tries = 600 } = opts || {}
  const useZone = m.includes('zone')
  const useSum = m.includes('sum')
  const useCons = m.includes('cons')
  const useCold = m.includes('hot')
  let best = null

  const passes = (picked, applyStrict) => {
    if (useCold) {
      let coldIn = 0
      for (const n of picked) if (s.cold.includes(n)) coldIn++
      if (coldIn > 1) return false
      if (forbidCold && coldIn > 0) return false
    }
    if (applyStrict) {
      if (useSum) {
        let sum = 0
        for (const n of picked) sum += n
        if (sum < cfg.sumMin || sum > cfg.sumMax) return false
      }
      if (useCons) {
        let cons = 0
        for (let i = 1; i < picked.length; i++) if (picked[i] - picked[i - 1] === 1) cons++
        if (cons > 1) return false
      }
      if (useZone) {
        const z = scoreRed(cfg, picked, s).zones
        if (!z.every((v, i) => Math.abs(v - cfg.zoneTarget[i]) <= 1)) return false
      }
    }
    return true
  }

  const tryRound = (attempts, applyStrict) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const picked = randPickUnique(pool, k).sort((a, b) => a - b)
      if (!passes(picked, applyStrict)) continue
      const sc = scoreRed(cfg, picked, s)
      const total = m.length && m.length < ALL_METHODS.length ? weightedScore(cfg, picked, s, m, sc) : sc.total
      if (!best || total > best.total) best = { red: picked, score: { ...sc, total } }
      if (best.total >= 92) break
    }
  }

  tryRound(tries, strict)
  if (strict && (!best || best.total < 92)) tryRound(300, false)
  if (!best) {
    const picked = randPick(range(cfg.redMax), k).sort((a, b) => a - b)
    return { red: picked, score: scoreRed(cfg, picked, s) }
  }
  return best
}

export function createPickerEngine(cfg, methods) {
  // cfg: GAME_CONFIG 中的 ssq / dlt
  // methods: 可选策略数组 ['zone','odd','sum','cons','hot']；空数组=真随机；不传=全部策略
  const m = normMethods(methods)
  const useHot = m.includes('hot')

  function buildPool(s) {
    const pool = []
    for (let n = 1; n <= cfg.redMax; n++) {
      let w = 2
      if (useHot && s.hot.includes(n)) w = 4
      if (useHot && s.cold.includes(n)) w = 1
      for (let i = 0; i < w; i++) pool.push(n)
    }
    return pool
  }

  function generateRed(s, pool, forbidCold, locked) {
    const lr = normLocked(cfg.redMax, locked)
    const need = cfg.redCount - lr.length
    if (need <= 0) return { red: lr.slice(0, cfg.redCount), score: null }
    // 真随机：不应用任何策略
    if (!m.length) {
      const poolArr = range(cfg.redMax).filter((n) => !lr.includes(n))
      return { red: [...lr, ...randPick(poolArr, need)].sort((a, b) => a - b), score: null }
    }
    const filteredPool = pool.filter((n) => !lr.includes(n))
    const r = pickBest(cfg, s, filteredPool, need, m, { forbidCold, strict: true, tries: 600 })
    return { red: [...lr, ...r.red].sort((a, b) => a - b), score: r.score }
  }

  function generateRedSet(s, pool, k, forbidCold, locked) {
    const lr = normLocked(cfg.redMax, locked)
    const need = k - lr.length
    if (need <= 0) return { red: lr.slice(0, k), score: null }
    if (!m.length) {
      const poolArr = range(cfg.redMax).filter((n) => !lr.includes(n))
      return { red: [...lr, ...randPick(poolArr, need)].sort((a, b) => a - b), score: null }
    }
    const filteredPool = pool.filter((n) => !lr.includes(n))
    const r = pickBest(cfg, s, filteredPool, need, m, { forbidCold, strict: false, tries: 800 })
    return { red: [...lr, ...r.red].sort((a, b) => a - b), score: r.score }
  }

  function buildBluePool(s) {
    const pool = []
    for (let b = 1; b <= cfg.blueMax; b++) {
      const w = useHot && s.hotBlue.has(b) ? 3 : 1
      for (let j = 0; j < w; j++) pool.push(b)
    }
    return pool
  }

  function generateBlue(s, pool, locked) {
    const lb = normLocked(cfg.blueMax, locked)
    const need = cfg.blueCount - lb.length
    if (need <= 0) return lb.slice(0, cfg.blueCount)
    if (!useHot) {
      const poolArr = range(cfg.blueMax).filter((n) => !lb.includes(n))
      return [...lb, ...randPick(poolArr, need)].sort((a, b) => a - b)
    }
    const bp = (pool || buildBluePool(s)).filter((n) => !lb.includes(n))
    const blues = []
    for (let i = 0; i < need; i++) {
      let b = bp[randInt(0, bp.length - 1)]
      if (blues.includes(b) && bp.length > 1) {
        b = bp[randInt(0, bp.length - 1)]
      }
      blues.push(b)
    }
    return [...lb, ...blues].sort((a, b) => a - b)
  }

  /** 按玩法生成一票。s/pool 可选：外部已预计算（generateUntil 循环内复用，避免重复统计）
   *  play.locked = { red: [固定红球], blue: [固定蓝球] } 可选：锁定号码必含，剩余由算法补齐 */
  function generatePlay(draws, play, preS, prePool) {
    if (!draws || draws.length === 0) return null
    const s = preS || computeStats(cfg, draws)
    const pool = prePool || buildPool(s)
    const type = play ? play.type : 'single'
    const append = !!(cfg.zhuijia && play && play.append)
    const locked = (play && play.locked) || {}
    const lockedRed = normLocked(cfg.redMax, locked.red)
    const lockedBlue = normLocked(cfg.blueMax, locked.blue)

    if (type === 'multi') {
      const n = Math.max(1, Math.min(20, (play && play.n) || 3))
      const tickets = []
      for (let i = 0; i < n; i++) {
        const t = generateRed(s, pool, i === 0, lockedRed)
        const blue = generateBlue(s, pool, lockedBlue)
        const score = t.score || scoreRed(cfg, t.red, s)
        tickets.push({ red: t.red, blue, score })
      }
      const ticket = { type: 'multi', tickets, append }
      const scored = scoreTicketPlay(cfg, draws, ticket, s)
      return { ticket, stats: s, ...scored }
    }

    if (type === 'duplex') {
      const r = Math.max(cfg.redCount + 1, Math.min(cfg.redMax, (play && play.redCount) || cfg.redCount + 1))
      const b = Math.max(cfg.blueCount, Math.min(cfg.blueMax, (play && play.blueCount) || cfg.blueCount))
      const lr = lockedRed.slice(0, r)
      const rs = generateRedSet(s, pool, r, false, lr)
      const lb = lockedBlue.slice(0, b)
      const needB = b - lb.length
      const bluePool = buildBluePool(s).filter((n) => !lb.includes(n))
      const blues = [...lb, ...randPickUnique(bluePool, needB)].sort((a, b) => a - b)
      const ticket = { type: 'duplex', red: rs.red, blue: blues, append }
      const scored = scoreTicketPlay(cfg, draws, ticket, s)
      return { ticket, stats: s, ...scored }
    }

    if (type === 'danTuo') {
      const danN = Math.max(1, Math.min(cfg.redCount - 1, (play && play.danN) || cfg.redCount - 1))
      const tuoN = Math.max(cfg.redCount - danN + 1, Math.min(cfg.redMax - danN, (play && play.tuoN) || cfg.redCount - danN + 2))
      // 锁定红球优先作为胆码；超出部分忽略
      const lr = lockedRed.slice(0, danN)
      const dan = generateRedSet(s, pool, danN, false, lr)
      const restPool = []
      for (let i = 1; i <= cfg.redMax; i++) {
        if (dan.red.includes(i)) continue
        let w = 2
        if (useHot && s.hot.includes(i)) w = 4
        if (useHot && s.cold.includes(i)) w = 1
        for (let j = 0; j < w; j++) restPool.push(i)
      }
      const tuo = randPickUnique(restPool, tuoN).sort((a, b) => a - b)
      // 后区胆拖（大乐透）：blueDanN>0 时蓝球也拆胆拖；lockedBlue 作为后区胆码锁定
      const blueDanN = Math.max(0, Math.min(cfg.blueCount - 1, (play && play.blueDanN) || 0))
      const blueTuoN = Math.max(cfg.blueCount - blueDanN, Math.min(cfg.blueMax - blueDanN, (play && play.blueTuoN) || cfg.blueCount))
      let ticket
      if (blueDanN > 0) {
        const lb = normLocked(cfg.blueMax, lockedBlue).slice(0, blueDanN)
        const needD = blueDanN - lb.length
        const bpool = buildBluePool(s).filter((n) => !lb.includes(n))
        const blueDan = needD > 0
          ? [...lb, ...randPickUnique(bpool, needD)].sort((a, b) => a - b).slice(0, blueDanN)
          : [...lb].sort((a, b) => a - b)
        const restBpool = bpool.filter((n) => !blueDan.includes(n))
        const blueTuo = randPickUnique(restBpool.length >= blueTuoN ? restBpool : [...restBpool, ...range(cfg.blueMax).filter((n) => !blueDan.includes(n))], blueTuoN).sort((a, b) => a - b)
        ticket = { type: 'danTuo', danRed: dan.red, tuoRed: tuo, blueDan, blueTuo, blue: [...blueDan, ...blueTuo].slice(0, cfg.blueMax), append }
      } else {
        // 复式胆拖：蓝球多选（官方玩法，双色球蓝球 1~16 任选、大乐透后区多选）
        const blueN = Math.max(cfg.blueCount, Math.min(cfg.blueMax, (play && play.blueCount) || cfg.blueCount))
        const lb = normLocked(cfg.blueMax, lockedBlue).slice(0, blueN)
        const needB = blueN - lb.length
        const bpool = buildBluePool(s).filter((n) => !lb.includes(n))
        const blues = needB > 0 ? [...lb, ...randPickUnique(bpool, needB)].sort((a, b) => a - b) : [...lb].sort((a, b) => a - b)
        ticket = { type: 'danTuo', danRed: dan.red, tuoRed: tuo, blue: blues, append }
      }
      const scored = scoreTicketPlay(cfg, draws, ticket, s)
      return { ticket, stats: s, ...scored }
    }

    // single（默认）
    const t = generateRed(s, pool, true, lockedRed)
    const blue = generateBlue(s, pool, lockedBlue)
    const score = t.score || scoreRed(cfg, t.red, s)
    const ticket = { type: 'single', red: t.red, blue, append }
    const scored = scoreTicketPlay(cfg, draws, ticket, s)
    return { ticket, stats: s, ...scored }
  }

  /**
   * 持续选号：循环生成直到平均分达到目标，返回尝试次数与最终票。
   * 异步实现：onProgress 回调 + 定时让出主线程，避免长循环卡死 UI。
   * stats/pool 只计算一次，全程复用，性能远优于逐次 generatePlay。
   */
  async function generateUntil(draws, play, target, maxAttempts, onProgress, onTicket, forceFull, stopCheck) {
    if (!draws || draws.length === 0) return null
    const cap = Math.max(1, maxAttempts || 20000)
    const t = Math.max(1, Math.min(100, target == null ? 70 : target))
    const s = computeStats(cfg, draws)
    const pool = buildPool(s)
    let best = null
    let hitOnce = false
    let stopped = false
    for (let i = 1; i <= cap; i++) {
      const r = generatePlay(draws, play, s, pool)
      if (!r) return null
      if (onTicket) onTicket(r, i)
      if (!best || r.total > best.total) {
        best = { ...r, attempts: i }
      }
      if (r.total >= t) {
        r.attempts = i
        r.hitTarget = true
        hitOnce = true
        if (!forceFull) return r
      }
      if (onProgress && i % 200 === 0) {
        onProgress(i, best)
        await new Promise((res) => setTimeout(res, 0))
        if (stopCheck && stopCheck()) {
          stopped = true
          break
        }
      }
    }
    if (best) {
      if (!stopped) best.attempts = cap
      if (!hitOnce) best.hitTarget = false
      if (stopped) best.stopped = true
    }
    return best
  }

  return {
    generate(draws, n = 3) {
      return generatePlay(draws, { type: 'multi', n })
    },
    generatePlay,
    generateUntil
  }
}

// ==================== 直位数字型引擎（福彩3D/排列3/排列5/7星彩） ====================

/** 直位统计：每位频率/遗漏 + 尾位频率（7星彩） */
export function computeDirectStats(cfg, draws) {
  const nPos = cfg.digits.length
  const freq = Array.from({ length: nPos }, () => new Array(10).fill(0))
  const miss = Array.from({ length: nPos }, () => new Array(10).fill(-1))
  const tailFreq = cfg.tailMax != null ? new Array(cfg.tailMax + 1).fill(0) : null
  const tailMiss = cfg.tailMax != null ? new Array(cfg.tailMax + 1).fill(-1) : null
  const sumTailFreq = new Array(10).fill(0)
  const total = draws.length
  for (let idx = 0; idx < total; idx++) {
    const d = draws[idx] || {}
    const digs = d.digits || []
    for (let p = 0; p < nPos && p < digs.length; p++) {
      const v = Number(digs[p])
      if (Number.isInteger(v) && v >= 0 && v <= 9) {
        freq[p][v]++
        miss[p][v] = idx
      }
    }
    if (tailFreq && d.tail != null) {
      const t = Number(d.tail)
      if (Number.isInteger(t) && t >= 0 && t <= cfg.tailMax) {
        tailFreq[t]++
        tailMiss[t] = idx
      }
    }
    // 和值尾数热度（直位选号常用：和值尾 0-9 冷热）
    let sSum = 0
    let sCnt = 0
    for (let p = 0; p < nPos && p < digs.length; p++) {
      const v = Number(digs[p])
      if (Number.isInteger(v) && v >= 0 && v <= 9) { sSum += v; sCnt++ }
    }
    if (sCnt) sumTailFreq[sSum % 10]++
  }
  const hotPos = []
  const coldPos = []
  for (let p = 0; p < nPos; p++) {
    const hot = []
    const cold = []
    for (let v = 0; v <= 9; v++) {
      if (freq[p][v] >= 3) hot.push(v)
      const m = miss[p][v] === -1 ? total : total - miss[p][v]
      if (m >= 10) cold.push(v)
    }
    hotPos.push(hot)
    coldPos.push(cold)
  }
  const lastDraw = draws[0] || {}
  return {
    freq,
    miss,
    tailFreq,
    tailMiss,
    sumTailFreq,
    total,
    hotPos,
    coldPos,
    lastDigits: lastDraw.digits || [],
    lastTail: lastDraw.tail != null ? lastDraw.tail : null
  }
}

/** 直位评分：每位热度 + 和值 + 奇偶 + 大小 + 形态 + 重号 + 跨度 + 尾位热度 */
export function scoreDigits(cfg, digits, tail, s) {
  if (!digits || !digits.length) return { total: 0 }
  let hotScore = 0
  digits.forEach((v, p) => {
    if (s.hotPos[p] && s.hotPos[p].includes(v)) hotScore += 1
    if (s.coldPos[p] && s.coldPos[p].includes(v)) hotScore -= 0.6
  })
  hotScore = Math.max(0, Math.min(100, 60 + hotScore * 25))

  const sum = digits.reduce((a, b) => a + b, 0)
  const mid = (cfg.sumMin + cfg.sumMax) / 2
  const sumScore = Math.max(0, 100 - (Math.abs(sum - mid) / Math.max(1, (cfg.sumMax - cfg.sumMin) / 2)) * 55)

  const target = digits.length / 2
  const odds = digits.filter((n) => n % 2 === 1).length
  const oddScore = Math.max(0, 100 - Math.abs(odds - target) * 30)
  const bigs = digits.filter((n) => n >= 5).length
  const sizeScore = Math.max(0, 100 - Math.abs(bigs - target) * 30)

  const uniq = new Set(digits).size
  let formScore = 100
  if (uniq === 1) formScore = 55
  else if (uniq === 2) formScore = 85
  else formScore = 95

  let reps = 0
  if (s.lastDigits && s.lastDigits.length) {
    digits.forEach((v, p) => { if (s.lastDigits[p] === v) reps++ })
  }
  const repeatScore = reps <= 1 ? 100 : Math.max(0, 100 - reps * 30)

  const sorted = [...digits].sort((a, b) => a - b)
  const span = sorted[sorted.length - 1] - sorted[0]
  const spanScore = span >= 2 && span <= 8 ? 100 : Math.max(0, 100 - Math.abs(span - 5) * 10)

  let tailScore = 100
  if (cfg.tailMax != null && tail != null && s.tailFreq) {
    const tf = s.tailFreq[tail] || 0
    tailScore = Math.max(0, Math.min(100, 60 + tf * 8))
  }

  // 012路：每位 %3 分布，三类出现越均衡分越高
  const routes = [0, 0, 0]
  digits.forEach((n) => routes[n % 3]++)
  const routeUniq = routes.filter((c) => c > 0).length
  const routeScore = routeUniq >= 3 ? 100 : Math.max(0, 100 - (3 - routeUniq) * 25)

  // 质合配比：质数个数接近半数
  const DP = new Set([2, 3, 5, 7])
  const primes = digits.filter((n) => DP.has(n)).length
  const primeScore = Math.max(0, 100 - Math.abs(primes - target) * 30)

  // 镜像对称：0-5、1-6、2-7、3-8、4-9 互补成对，成对越多越对称
  const mirrorPair = { 0: 5, 1: 6, 2: 7, 3: 8, 4: 9, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4 }
  let paired = 0
  const seen = new Set()
  digits.forEach((n) => {
    const m = mirrorPair[n]
    if (m != null && seen.has(m)) { paired++; seen.delete(m) }
    else seen.add(n)
  })
  const mirrorScore = paired >= Math.floor(digits.length / 2) ? 100 : Math.max(0, 100 - (Math.floor(digits.length / 2) - paired) * 40)

  // 龙头凤尾：首位偏小、末位偏大
  let headTailScore = 100
  if (digits.length >= 2) {
    const head = digits[0]
    const tailLast = digits[digits.length - 1]
    headTailScore = 50 + Math.max(0, 3 - head) * 10 + Math.max(0, tailLast - 6) * 10
    headTailScore = Math.max(0, Math.min(100, headTailScore))
  }

  // 和值尾数热度
  let sumTailScore = 100
  if (s.sumTailFreq && s.sumTailFreq.length) {
    const stf = s.sumTailFreq[sum % 10] || 0
    sumTailScore = Math.max(0, Math.min(100, 60 + stf * 6))
  }

  // 遗漏回补：每位数字遗漏适中（5~20期）加分，过热过冷减分
  let omitScore = 100
  if (s.miss) {
    let penalty = 0
    digits.forEach((v, p) => {
      const mv = s.miss[p] != null ? s.miss[p][v] : -1
      const m = mv === -1 ? s.total : s.total - mv
      if (m >= 5 && m <= 20) penalty += 0
      else penalty += 0.35
    })
    omitScore = Math.max(0, Math.min(100, 100 - penalty * 20))
  }

  const total = Math.round(
    hotScore * 0.18 + sumScore * 0.14 + oddScore * 0.1 + sizeScore * 0.08 +
    formScore * 0.06 + repeatScore * 0.06 + spanScore * 0.06 + tailScore * 0.06 +
    routeScore * 0.06 + primeScore * 0.06 + mirrorScore * 0.04 + headTailScore * 0.04 +
    sumTailScore * 0.04 + omitScore * 0.02
  )
  // 14 分项数组，顺序与 gpu-engine 的 DIGIT_W 权重一一对应
  const parts = [hotScore, sumScore, oddScore, sizeScore, formScore, repeatScore, spanScore, tailScore, routeScore, primeScore, mirrorScore, headTailScore, sumTailScore, omitScore]
  return { hotScore, sumScore, oddScore, sizeScore, formScore, repeatScore, spanScore, tailScore, routeScore, primeScore, mirrorScore, headTailScore, sumTailScore, omitScore, parts, total, sum }
}

/** 生成一注直位号码：每位按热度加权池采样，多次择优取最高分 */
export function generateDirect(cfg, draws, opts = {}) {
  if (!draws || !draws.length) return null
  const s = computeDirectStats(cfg, draws)
  const nPos = cfg.digits.length
  const tries = Math.max(1, opts.tries || 200)
  let best = null
  for (let i = 0; i < tries; i++) {
    const digits = []
    for (let p = 0; p < nPos; p++) {
      const pool = []
      for (let v = 0; v <= 9; v++) {
        let w = 2
        if (s.hotPos[p].includes(v)) w = 4
        if (s.coldPos[p].includes(v)) w = 1
        for (let j = 0; j < w; j++) pool.push(v)
      }
      digits.push(pool[randInt(0, pool.length - 1)])
    }
    let tail = null
    if (cfg.tailMax != null) {
      const tpool = []
      for (let t = 0; t <= cfg.tailMax; t++) {
        let w = 2
        if (s.tailFreq && s.tailFreq[t] >= 3) w = 4
        for (let j = 0; j < w; j++) tpool.push(t)
      }
      tail = tpool[randInt(0, tpool.length - 1)]
    }
    const score = scoreDigits(cfg, digits, tail, s)
    if (!best || score.total > best.score.total) best = { digits, tail, score }
  }
  return best
}

/** 直位玩法注数与金额计算：单注/多注/定位复式 */
export function calcDirectPlay(cfg, play) {
  const type = play ? play.type : 'single'
  let combos = 0
  if (type === 'single') combos = 1
  else if (type === 'multi') combos = Math.max(1, play.n || (Array.isArray(play.tickets) ? play.tickets.length : 1))
  else if (type === 'duplex') {
    let c = 1
    ;(play.pos || []).forEach((arr) => {
      if (Array.isArray(arr) && arr.length) c *= arr.length
    })
    if (play.tail && Array.isArray(play.tail) && play.tail.length) c *= play.tail.length
    combos = c
  }
  const multiple = Math.max(1, Math.min(99, (play && play.multiple) || 1))
  return { combos, amount: combos * 2 * multiple, append: false, multiple }
}

/** 直位票展开为单注数组（定位复式做笛卡尔积；7星彩含尾位） */
export function expandDirectTicket(cfg, ticket) {
  const type = ticket.type || 'single'
  const out = []
  if (type === 'single') {
    out.push({ digits: [...(ticket.digits || [])], tail: ticket.tail != null ? ticket.tail : null, zx: ticket.zx || 'direct' })
  } else if (type === 'multi') {
    ;(ticket.tickets || []).forEach((t) => {
      out.push({ digits: [...(t.digits || [])], tail: t.tail != null ? t.tail : null, zx: ticket.zx || t.zx || 'direct' })
    })
  } else if (type === 'duplex') {
    const pos = (ticket.pos || []).map((arr) => [...arr])
    const tails = ticket.tail && Array.isArray(ticket.tail) && ticket.tail.length ? [...ticket.tail] : [null]
    let combos = [[]]
    pos.forEach((arr) => {
      const next = []
      combos.forEach((c) => arr.forEach((v) => next.push([...c, v])))
      combos = next
    })
    combos.forEach((c) => {
      tails.forEach((t) => out.push({ digits: c, tail: t, zx: ticket.zx || 'direct' }))
    })
  }
  return out
}

/** 直位生成器：持续生成直到平均分达到目标 */
export function createDirectPickerEngine(cfg) {
  async function generateUntil(draws, play, target, maxAttempts, onProgress, onTicket, forceFull, stopCheck) {
    if (!draws || !draws.length) return null
    const cap = Math.max(1, maxAttempts || 20000)
    const t = Math.max(1, Math.min(100, target == null ? 70 : target))
    const n = play && play.type === 'multi' ? Math.max(1, Math.min(20, play.n || 3)) : 1
    let best = null
    let hitOnce = false
    let stopped = false
    for (let i = 1; i <= cap; i++) {
      const lines = []
      for (let j = 0; j < n; j++) {
        const g = generateDirect(cfg, draws, { tries: 80 })
        if (g) lines.push(g)
      }
      if (!lines.length) return null
      const avg = Math.round(lines.reduce((a, x) => a + x.score.total, 0) / lines.length)
      const ticket =
        n > 1
          ? { type: 'multi', tickets: lines.map((l) => ({ digits: l.digits, tail: l.tail })) }
          : { type: 'single', digits: lines[0].digits, tail: lines[0].tail }
      const r = { ticket, total: avg, count: n, stats: computeDirectStats(cfg, draws) }
      if (onTicket) onTicket(r, i)
      if (!best || avg > best.total) best = { ...r, attempts: i }
      if (avg >= t) {
        r.attempts = i
        r.hitTarget = true
        hitOnce = true
        if (!forceFull) return r
      }
      if (onProgress && i % 200 === 0) {
        onProgress(i, best)
        await new Promise((res) => setTimeout(res, 0))
        if (stopCheck && stopCheck()) {
          stopped = true
          break
        }
      }
    }
    if (best) {
      if (!stopped) best.attempts = cap
      if (!hitOnce) best.hitTarget = false
      if (stopped) best.stopped = true
    }
    return best
  }
  return {
    generate(draws, n = 3) {
      const lines = []
      for (let j = 0; j < n; j++) {
        const g = generateDirect(cfg, draws)
        if (g) lines.push(g)
      }
      return {
        ticket: { type: 'multi', tickets: lines.map((l) => ({ digits: l.digits, tail: l.tail })) },
        total: lines.length ? Math.round(lines.reduce((a, x) => a + x.score.total, 0) / lines.length) : 0,
        count: lines.length,
        stats: computeDirectStats(cfg, draws)
      }
    },
    generateUntil
  }
}

/**
 * 按彩种推荐策略动态生成评分条（AiPicker / MyPicks 共用）。
 * 每个彩种按 cfg.recommendMethods 展示对应维度的评分，数量与推荐策略一致（≥6），
 * 缺失字段兜底 0，避免旧数据/直位字段不存在时显示 NaN。
 */
const SCORE_ITEM_DEFS = {
  // 乐透型（红蓝球）
  zone: { label: '区间', key: 'zoneScore' },
  odd: { label: '奇偶', key: 'oddScore' },
  sum: { label: '和值', key: 'sumScore' },
  cons: { label: '连号', key: 'consScore' },
  hot: { label: '冷热', key: 'hotScore' },
  size: { label: '大小', key: 'sizeScore' },
  prime: { label: '质合', key: 'primeScore' },
  route: { label: '012路', key: 'routeScore' },
  span: { label: '跨度', key: 'spanScore' },
  tail: { label: '尾数', key: 'tailScore' },
  repeat: { label: '重号', key: 'repeatScore' },
  omit: { label: '遗漏', key: 'omitScore' },
  ac: { label: 'AC值', key: 'acScore' },
  neighbor: { label: '邻号', key: 'neighborScore' },
  golden: { label: '黄金分割', key: 'goldenScore' },
  mirror: { label: '镜像对称', key: 'mirrorScore' },
  sumTail: { label: '和值尾', key: 'sumTailScore' },
  mean: { label: '均值回归', key: 'meanScore' },
  fibo: { label: '斐波那契', key: 'fiboScore' },
  headTail: { label: '龙头凤尾', key: 'headTailScore' },
  clamp: { label: '夹号定位', key: 'clampScore' }
}
export function scoreItemsFor(cfg, score) {
  const safe = (v) => (Number.isFinite(v) ? v : 0)
  const methods = (cfg && cfg.recommendMethods && cfg.recommendMethods.length) ? cfg.recommendMethods : ALL_METHODS
  const items = []
  methods.forEach((m) => {
    const def = SCORE_ITEM_DEFS[m]
    if (!def || !score) return
    if (Number.isFinite(score[def.key])) items.push({ label: def.label, value: safe(score[def.key]), method: m })
  })
  // 直位彩种额外兼容 formScore（形态组合）
  if (cfg && cfg.playMode === 'direct' && Number.isFinite(score.formScore)) {
    items.push({ label: '形态', value: safe(score.formScore), method: 'form' })
  }
  if (!items.length && score) {
    // 兜底：至少展示总分
    items.push({ label: '综合', value: safe(score.total), method: 'total' })
  }
  return items
}

// ==================== 批量生成接口（GPU 加速 / CPU 兜底） ====================
/**
 * 批量生成选号（AI 一直选 / 暴力模式加速入口）。
 * 优先走 gpu-engine 的 L1 WebGPU / L2 GPU.js / L3 Worker；不可用或复杂玩法（复式/胆拖/锁定）自动降级 CPU。
 * opts: {
 *   count, target, play, methods, forceFull, collectFreq,
 *   onProgress(done, best), stopCheck, useGpu
 * }
 * 返回与 generateUntil 兼容的结构：
 * { ticket, total, max, min, count, lines, stats, attempts, hitTarget, stopped, level, freqMap }
 */
export async function generateBatch(cfg, draws, opts = {}) {
  if (!draws || !draws.length) return null
  const play = opts.play || { type: 'single' }
  const type = play.type || 'single'
  const isDirect = cfg.playMode === 'direct'
  const count = Math.max(1, opts.count || 20000)
  const target = Math.max(1, Math.min(100, opts.target == null ? 70 : opts.target))
  const forceFull = !!opts.forceFull
  const collectFreq = !!opts.collectFreq
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
  const stopCheck = typeof opts.stopCheck === 'function' ? opts.stopCheck : null

  // 复杂路径（复式/胆拖/锁定号码）不适用批量加速，直接降级 CPU
  const locked = (play && play.locked) || {}
  const hasLock = (locked.red && locked.red.length) || (locked.blue && locked.blue.length)
  const complex = type === 'duplex' || type === 'danTuo' || hasLock

  let level = 'cpu'
  const stats = isDirect ? computeDirectStats(cfg, draws) : computeStats(cfg, draws)

  // 复式/胆拖（不含锁定号码）GPU 化：展开单注 → GPU 批量评分（Set 依赖项已查表预编码传入内核）
  // 锁定号码场景保持正确性优先，仍走 CPU；展开量超限也降级 CPU（避免内存爆炸）
  const EXPAND_LIMIT = 60000
  if (complex && !hasLock && opts.useGpu !== false) {
    try {
      const expanded = expandTicket(cfg, play)
      if (expanded.length && expanded.length <= EXPAND_LIMIT) {
        const gs = getGPUState()
        if (gs && gs.level && gs.level !== 'cpu') {
          const sc = await scoreCandidates(cfg, stats, expanded)
          if (sc && sc.ok && sc.cands && sc.cands.length === expanded.length) {
            const scored = expanded.map((l, i) => ({ ...l, score: { total: sc.cands[i].total || 0 } }))
            const totals = scored.map((x) => x.score.total || 0)
            const max = Math.round(Math.max(...totals))
            const min = Math.round(Math.min(...totals))
            const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
            return {
              ticket: play,
              total: avg,
              max,
              min,
              count: totals.length,
              lines: scored,
              stats,
              attempts: totals.length,
              hitTarget: max >= target,
              stopped: false,
              level: sc.level
            }
          }
        }
      }
    } catch (e) {
      console.warn('[picker-engine] 复式/胆拖 GPU 评分失败，降级 CPU:', e)
    }
  }

  // 组装成 generateUntil 兼容返回
  const wrap = (r) => {
    if (!r) return null
    const out = { ...r }
    out.level = r.level || level
    if (!out.lines || !out.lines.length) {
      try {
        if (isDirect) {
          const scored = scoreDirectTicketBatch(cfg, draws, r.ticket, stats)
          out.lines = scored.lines || []
        } else {
          const scored = scoreTicketPlay(cfg, draws, r.ticket, stats)
          out.lines = scored.lines || []
        }
      } catch (e) { out.lines = [] }
    }
    if (out.hitTarget == null && !out.stopped) {
      out.hitTarget = !!(out.total != null && out.total >= target)
    }
    return out
  }

  const useGpu = opts.useGpu !== false && !complex
  let gpuState = null
  if (useGpu) {
    try { gpuState = getGPUState() } catch (e) { gpuState = null }
  }
  if (gpuState && gpuState.level && gpuState.level !== 'cpu' && useGpu) {
    const r = await runBatch(cfg, draws, stats, {
      playType: type,
      n: type === 'multi' ? Math.max(1, play.n || 3) : 1,
      count,
      target,
      forceFull,
      collectFreq,
      onProgress,
      stopCheck,
      level: gpuState.level
    })
    if (r && r.ok) return wrap(r)
  }

  // ===== CPU 兜底批量（加权池采样 + 现成评分，输出与 generateUntil 兼容） =====
  level = 'cpu'
  const n = type === 'multi' ? Math.max(1, Math.min(20, play.n || 3)) : 1
  const s = stats
  const cap = count
  let best = null
  let hitOnce = false
  let stopped = false
  const freqMap = {}
  const addFreq = (ticket) => {
    const lines = ticket && ticket.type === 'multi' ? (ticket.tickets || []) : [ticket]
    for (const ln of lines) {
      if (!ln) continue
      if (isDirect) {
        const digs = ln.digits || []
        digs.forEach((v, p) => { const k = 'p_' + p + '_' + v; freqMap[k] = (freqMap[k] || 0) + 1 })
        if (ln.tail != null) { const k = 'tail_' + ln.tail; freqMap[k] = (freqMap[k] || 0) + 1 }
      } else {
        ;(ln.red || []).forEach((v) => { const k = 'red_' + v; freqMap[k] = (freqMap[k] || 0) + 1 })
        ;(ln.blue || []).forEach((v) => { const k = 'blue_' + v; freqMap[k] = (freqMap[k] || 0) + 1 })
      }
    }
  }
  // 加权采样红球（与 generateRed 的 buildPool 权重一致）
  const m = normMethods(opts.methods)
  const useHot = m.includes('hot')
  const redPool = []
  for (let i = 1; i <= cfg.redMax; i++) {
    let w = 2
    if (useHot && s.hot.includes(i)) w = 4
    if (useHot && s.cold.includes(i)) w = 1
    for (let j = 0; j < w; j++) redPool.push(i)
  }
  const sampleRed = () => {
    const need = cfg.redCount
    const out = []
    let guard = 0
    while (out.length < need && guard < 200) {
      const v = redPool[randInt(0, redPool.length - 1)]
      if (!out.includes(v)) out.push(v)
      guard++
    }
    while (out.length < need) { const v = randInt(1, cfg.redMax); if (!out.includes(v)) out.push(v) }
    return out.sort((a, b) => a - b)
  }
  const sampleBlue = () => {
    if (!cfg.blueCount) return []
    const pool = []
    for (let b = 1; b <= cfg.blueMax; b++) {
      const w = useHot && s.hotBlue.has(b) ? 3 : 1
      for (let j = 0; j < w; j++) pool.push(b)
    }
    const out = []
    let guard = 0
    while (out.length < cfg.blueCount && guard < 200) {
      const v = pool[randInt(0, pool.length - 1)]
      if (!out.includes(v)) out.push(v)
      guard++
    }
    while (out.length < cfg.blueCount) { const v = randInt(1, cfg.blueMax); if (!out.includes(v)) out.push(v) }
    return out.sort((a, b) => a - b)
  }
  // 直位采样（每位按 hot 权重）
  const sampleDigits = () => {
    const nPos = cfg.digits.length
    const digs = []
    for (let p = 0; p < nPos; p++) {
      const w = []
      for (let v = 0; v <= 9; v++) {
        let wt = 2
        if (s.hotPos[p] && s.hotPos[p].includes(v)) wt = 4
        if (s.coldPos[p] && s.coldPos[p].includes(v)) wt = 1
        w.push(wt)
      }
      const tw = w.reduce((a, b) => a + b, 0)
      let r = Math.random() * tw
      let vi = 0
      for (let v = 0; v <= 9; v++) { r -= w[v]; if (r <= 0) { vi = v; break } }
      digs.push(vi)
    }
    let tail = null
    if (cfg.tailMax != null) {
      const tw = []
      for (let t = 0; t <= cfg.tailMax; t++) {
        let wt = 2
        if (s.tailFreq && s.tailFreq[t] >= 3) wt = 4
        tw.push(wt)
      }
      const totalW = tw.reduce((a, b) => a + b, 0)
      let r = Math.random() * totalW
      let vi = 0
      for (let t = 0; t <= cfg.tailMax; t++) { r -= tw[t]; if (r <= 0) { vi = t; break } }
      tail = vi
    }
    return { digits: digs, tail }
  }

  let done = 0
  const batchStep = Math.max(64, Math.min(1024, Math.ceil(cap / 10)))
  for (let i = 0; i < cap; i++) {
    let ticket
    let total
    if (isDirect) {
      const g = sampleDigits()
      const sc = scoreDigits(cfg, g.digits, g.tail, s)
      total = sc.total
      ticket = n > 1 ? { type: 'multi', tickets: [g] } : g
    } else {
      const red = sampleRed()
      const blue = sampleBlue()
      const sc = scoreRed(cfg, red, s)
      total = sc.total
      ticket = n > 1 ? { type: 'multi', tickets: [{ red, blue }] } : { type: 'single', red, blue }
    }
    if (collectFreq) addFreq(ticket)
    if (!best || total > best.total) {
      best = { ticket, total, attempts: done + 1, stats: s }
    }
    if (total >= target) {
      best.hitTarget = true
      hitOnce = true
      if (!forceFull) break
    }
    done++
    if (onProgress && done % batchStep === 0) {
      onProgress(done, best)
      await new Promise((res) => setTimeout(res, 0))
      if (stopCheck && stopCheck()) { stopped = true; break }
    }
  }
  if (!best) return null
  const scored = isDirect
    ? scoreDirectTicketBatch(cfg, draws, best.ticket, s)
    : scoreTicketPlay(cfg, draws, best.ticket, s)
  return {
    ticket: best.ticket,
    total: best.total,
    max: scored.max != null ? scored.max : best.total,
    min: scored.min != null ? scored.min : best.total,
    count: done,
    lines: scored.lines || [],
    stats: s,
    attempts: done,
    hitTarget: best.hitTarget || hitOnce,
    stopped,
    level,
    freqMap: collectFreq ? freqMap : undefined
  }
}

// 直位批量票评分辅助（与 AiPicker directTicketFromLines 逻辑一致地生成 lines）
function scoreDirectTicketBatch(cfg, draws, ticket, s) {
  const src = ticket && ticket.type === 'multi' ? (ticket.tickets || []) : [ticket]
  const lines = src.map((g) => {
    const sc = scoreDigits(cfg, g.digits, g.tail, s)
    return { ...g, score: sc }
  })
  const totals = lines.map((x) => x.score.total || 0)
  return {
    total: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    max: totals.length ? Math.round(Math.max(...totals)) : 0,
    min: totals.length ? Math.round(Math.min(...totals)) : 0,
    lines,
    count: totals.length
  }
}
