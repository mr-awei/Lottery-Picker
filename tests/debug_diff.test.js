import { describe, it, expect, vi } from 'vitest'
vi.mock('gpu.js', () => ({
  GPU: class {
    constructor() { throw new Error('[vitest] GPU disabled') }
  }
}))
import { GAME_CONFIG } from '../src/utils/game-config'
import { computeStats, computeDirectStats, scoreRed, scoreDigits } from '../src/utils/picker-engine'
import { scoreRedCPU, scoreDigitsCPU } from '../src/utils/gpu-engine'

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

describe('debug diff', () => {
  it('RED diff fields', () => {
    const key = COMBO_KEYS[0]
    const cfg = GAME_CONFIG[key]
    const s = computeStats(cfg, comboDraws(cfg, 20))
    const redSet = new Set()
    while (redSet.size < cfg.redCount) redSet.add(1 + ((3 * 13 + redSet.size * 7) % cfg.redMax))
    const red = [...redSet].sort((a, b) => a - b)
    const cpu = scoreRedCPU(cfg, red, s)
    const gpu = scoreRed(cfg, red, s)
    const ck = Object.keys(cpu)
    const gk = Object.keys(gpu)
    console.log('game:', key, 'red:', red.join(','))
    console.log('cpu keys:', ck.join(','))
    console.log('gpu keys:', gk.join(','))
    console.log('only-cpu:', ck.filter((k) => !gk.includes(k)).join(',') || '-')
    console.log('only-gpu:', gk.filter((k) => !ck.includes(k)).join(',') || '-')
    for (const k of ck) {
      if (k === 'stats') continue
      if (typeof cpu[k] === 'number' && typeof gpu[k] === 'number' && Math.abs(cpu[k] - gpu[k]) > 1e-9) {
        console.log(`DIFF ${k}: cpu=${cpu[k]} gpu=${gpu[k]}`)
      } else if (typeof cpu[k] === 'number' && typeof gpu[k] !== 'number') {
        console.log(`TYPEDIFF ${k}: cpu=${cpu[k]} (${typeof cpu[k]}) gpu=${gpu[k]} (${typeof gpu[k]})`)
      } else if (typeof cpu[k] !== 'number') {
        console.log(`NONNUM ${k}: cpu=${JSON.stringify(cpu[k])} gpu=${JSON.stringify(gpu[k])}`)
      }
    }
    expect(true).toBe(true)
  })
  it('DIGIT diff fields', () => {
    const key = DIRECT_KEYS[0]
    const cfg = GAME_CONFIG[key]
    const s = computeDirectStats(cfg, directDraws(cfg, 20))
    const digits = cfg.digits.map((_, p) => (3 + p * 4) % 10)
    const tail = cfg.tailMax != null ? (3 % (cfg.tailMax + 1)) : null
    const cpu = scoreDigitsCPU(cfg, digits, tail, s)
    const gpu = scoreDigits(cfg, digits, tail, s)
    const ck = Object.keys(cpu)
    const gk = Object.keys(gpu)
    console.log('game:', key, 'digits:', digits.join(','), 'tail:', tail)
    console.log('cpu keys:', ck.join(','))
    console.log('gpu keys:', gk.join(','))
    console.log('only-cpu:', ck.filter((k) => !gk.includes(k)).join(',') || '-')
    console.log('only-gpu:', gk.filter((k) => !ck.includes(k)).join(',') || '-')
    for (const k of ck) {
      if (k === 'stats') continue
      if (typeof cpu[k] === 'number' && typeof gpu[k] === 'number' && Math.abs(cpu[k] - gpu[k]) > 1e-9) {
        console.log(`DIFF ${k}: cpu=${cpu[k]} gpu=${gpu[k]}`)
      } else if (typeof cpu[k] === 'number' && typeof gpu[k] !== 'number') {
        console.log(`TYPEDIFF ${k}: cpu=${cpu[k]} (${typeof cpu[k]}) gpu=${gpu[k]} (${typeof gpu[k]})`)
      } else if (typeof cpu[k] !== 'number') {
        console.log(`NONNUM ${k}: cpu=${JSON.stringify(cpu[k])} gpu=${JSON.stringify(gpu[k])}`)
      }
    }
    expect(true).toBe(true)
  })
})
