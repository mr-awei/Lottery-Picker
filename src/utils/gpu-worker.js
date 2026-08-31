/**
 * gpu-worker.js — L3 Web Worker 多线程批量生成+评分
 * 复用 picker-engine 现成 scoreRed / scoreDigits，保证与旧逻辑 100% 一致
 */
import { computeStats, scoreRed, computeDirectStats, scoreDigits } from './picker-engine'

function sampleUnique(vals, w, k, seed) {
  const totalW = w.reduce((a, b) => a + b, 0)
  let st = (seed >>> 0) || 1
  const rnd = () => {
    st = (st * 1664525 + 1013904223) >>> 0
    return (st & 0xFFFFFF) / 16777216
  }
  const out = []
  for (let i = 0; i < k; i++) {
    let got = -1
    for (let g = 0; g < 32; g++) {
      let acc = 0
      const r = rnd() * totalW
      let vi = vals.length - 1
      for (let j = 0; j < vals.length; j++) {
        acc += w[j]
        if (r < acc) { vi = j; break }
      }
      const v = vals[vi]
      if (!out.includes(v)) { got = v; break }
    }
    if (got < 0) got = vals[(i * 7) % vals.length]
    out.push(got)
  }
  return out.sort((a, b) => a - b)
}

function buildComboPool(cfg, stats) {
  const hotSet = new Set(stats.hot || [])
  const coldSet = new Set(stats.cold || [])
  const vals = []
  const w = []
  for (let n = 1; n <= cfg.redMax; n++) {
    let wt = 2
    if (hotSet.has(n)) wt = 4
    if (coldSet.has(n)) wt = 1
    vals.push(n)
    w.push(wt)
  }
  return { vals, w }
}

function buildDirectPool(cfg, stats) {
  const nPos = cfg.digits.length
  const posW = []
  for (let p = 0; p < nPos; p++) {
    const row = new Array(10).fill(2)
    const hot = stats.hotPos[p] || []
    const cold = stats.coldPos[p] || []
    for (const v of hot) row[v] = 4
    for (const v of cold) row[v] = 1
    posW.push(row)
  }
  let tailW = null
  if (cfg.tailMax != null && stats.tailFreq) {
    tailW = new Array(cfg.tailMax + 1).fill(2)
    for (let t = 0; t <= cfg.tailMax; t++) if (stats.tailFreq[t] >= 3) tailW[t] = 4
  }
  return { posW, tailW }
}

self.onmessage = (e) => {
  const { type, cfg, draws, isDirect, count, seed } = e.data || {}
  if (type !== 'start') return
  const batchSize = 4096
  const s = isDirect ? computeDirectStats(cfg, draws) : computeStats(cfg, draws)
  const pool = isDirect ? buildDirectPool(cfg, s) : buildComboPool(cfg, s)
  let done = 0
  let batch = []
  let st = (seed >>> 0) || 1
  const rnd = () => {
    st = (st * 1664525 + 1013904223) >>> 0
    return (st & 0xFFFFFF) / 16777216
  }

  const flush = () => {
    if (!batch.length) return
    self.postMessage({ type: 'batch', cands: batch })
    batch = []
  }

  for (let i = 0; i < count; i++) {
    if (isDirect) {
      const digits = []
      for (let p = 0; p < cfg.digits.length; p++) {
        const row = pool.posW[p]
        const totalW = row.reduce((a, b) => a + b, 0)
        let acc = 0
        let vi = 0
        const r = rnd() * totalW
        for (let j = 0; j < 10; j++) {
          acc += row[j]
          if (r < acc) { vi = j; break }
        }
        digits.push(vi)
      }
      let tail = null
      if (pool.tailW) {
        const totalW = pool.tailW.reduce((a, b) => a + b, 0)
        let acc = 0
        let vi = 0
        const r = rnd() * totalW
        for (let j = 0; j < pool.tailW.length; j++) {
          acc += pool.tailW[j]
          if (r < acc) { vi = j; break }
        }
        tail = vi
      }
      const sc = scoreDigits(cfg, digits, tail, s)
      batch.push({ digits, tail, total: sc.total })
    } else {
      const red = sampleUnique(pool.vals, pool.w, cfg.redCount, (seed >>> 0) + i * 2654435761)
      const sc = scoreRed(cfg, red, s)
      batch.push({ red, total: sc.total })
    }
    done++
    if (batch.length >= batchSize) flush()
  }
  flush()
  self.postMessage({ type: 'done', count: done })
}
