/**
 * gpu-engine.js — 四层 GPU 加速引擎
 *
 * 层级：
 *   L1 WebGPU Compute Shader (WGSL)   —— 主方案，GPU 批量生成候选 + 21/14 分项纯算术评分
 *   L2 GPU.js (WebGL2)                —— 兜底：CPU 批量生成候选，GPU 内核算分项并输出总分
 *   L3 Web Worker 多线程              —— 兜底：多 worker 并行生成 + 现成 scoreRed/scoreDigits 评分
 *   L4 CPU 直跑                       —— 最终兜底（由 picker-engine 内部实现，本文件不参与）
 *
 * 设计要点：
 *   - 不 import picker-engine（避免循环依赖），自行复刻评分公式用于 CPU 对照与一致性校验
 *   - 所有 Set 依赖项（hot/cold/prime/last/neighbor/golden/clamp/遗漏）预编码为查表数组传入 GPU
 *   - L1 输出 21/14 个分项，最终总分在 CPU 端加权合成，与现有 scoreRed/scoreDigits 完全一致
 */
import { GPU } from 'gpu.js'

export const LEVELS = {
  WEBGPU: 'webgpu',
  GPUJS: 'gpu.js',
  WORKER: 'worker',
  CPU: 'cpu'
}

export const LEVEL_LABELS = {
  [LEVELS.WEBGPU]: 'WebGPU',
  [LEVELS.GPUJS]: 'GPU.js',
  [LEVELS.WORKER]: 'Worker',
  [LEVELS.CPU]: 'CPU'
}

// 手动方案选择：auto=原自动降级；其余四选一=锁定指定方案（不可用时置为 CPU 并在 schemeError 提示）
export const SCHEMES = {
  AUTO: 'auto',
  WEBGPU: 'webgpu',
  GPUJS: 'gpu.js',
  WORKER: 'worker',
  CPU: 'cpu'
}
export const SCHEME_LABELS = {
  auto: '自动（逐级降级）',
  webgpu: 'WebGPU',
  'gpu.js': 'GPU.js',
  worker: 'Worker 多线程',
  cpu: 'CPU（不使用 GPU）'
}
export const GPU_SCHEME_KEY = 'lp-gpu-scheme'
export const GPU_DEVICE_KEY = 'lp-gpu-device'

// 与 scoreRed / scoreDigits 一致的权重表（CPU 端加权合成）
const RED_W = [0.1, 0.08, 0.09, 0.05, 0.08, 0.08, 0.04, 0.06, 0.04, 0.04, 0.04, 0.03, 0.02, 0.04, 0.03, 0.02, 0.03, 0.04, 0.02, 0.04, 0.03]
const DIGIT_W = [0.18, 0.14, 0.1, 0.08, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.04, 0.04, 0.04, 0.02]

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31])

/* ==================== 状态 ==================== */
const _state = {
  level: LEVELS.CPU,
  gpuName: '',
  adapterInfo: null,
  webgpuDevice: null,
  redPipeline: null,
  digitPipeline: null,
  gpuJs: null,
  gpuJsKernels: null,
  gpuDevices: [],
  scheme: SCHEMES.AUTO,
  schemeError: '',
  deviceError: '',
  detecting: false,
  ready: false
}

export function getGPUState() {
  return { level: _state.level, gpuName: _state.gpuName, ready: _state.ready }
}

/* ==================== WGSL 内核 ==================== */
// maps 布局：hotMap[redMax], coldMap[redMax], primeMap[redMax], lastMap[redMax], neighborMap[redMax], goldenMap[redMax], clampMap[redMax]
const RED_WGSL = `
@group(0) @binding(0) var<storage, read> vals: array<i32>;
@group(0) @binding(1) var<storage, read> w: array<i32>;
@group(0) @binding(2) var<storage, read> maps: array<i32>;
@group(0) @binding(3) var<storage, read> omit: array<f32>;
@group(0) @binding(4) var<storage, read> params: array<f32>;
@group(0) @binding(5) var<storage, read_write> outNums: array<i32>;
@group(0) @binding(6) var<storage, read_write> outParts: array<f32>;
@group(0) @binding(7) var<storage, read> candsIn: array<i32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = i32(gid.x);
  if (idx >= i32(params[19])) { return; }
  let nVals = i32(params[0]);
  let need = i32(params[2]);
  let redMax = i32(params[3]);
  let redCount = i32(params[4]);
  let zoneE0 = i32(params[5]);
  let zoneE1 = i32(params[6]);
  let zoneT0 = i32(params[7]);
  let zoneT1 = i32(params[8]);
  let zoneT2 = i32(params[9]);
  let zoneCnt = i32(params[10]);
  let sumMin = i32(params[11]);
  let sumMax = i32(params[12]);
  let sizeSplit = i32(params[13]);
  let spanMin = i32(params[14]);
  let spanMax = i32(params[15]);
  let sumRecent = params[16];
  let mirrorVal = i32(params[17]);
  let headEdge = i32(params[18]);

  var st: u32 = u32(params[20]) + u32(idx) * 2654435761u;
  var sel: array<i32, 16>;
  var selN: i32 = 0;
  var i: i32 = 0;
  if (i32(params[21]) == 1) {
    // 外部候选评分模式：直接从 candsIn 读取候选（不采样）
    for (i = 0; i < need; i++) { sel[i] = candsIn[idx * need + i]; }
    selN = need;
  } else {
  for (i = 0; i < need; i++) {
    var got: i32 = -1;
    var guard: i32 = 0;
    while (guard < 32) {
      st = st * 1664525u + 1013904223u;
      let r: f32 = f32(st & 0xFFFFFFu) / 16777216.0;
      var acc: f32 = 0.0;
      var vi: i32 = 0;
      var j: i32 = 0;
      for (j = 0; j < nVals; j++) {
        acc += f32(w[j]);
        if (r < acc) { vi = j; break; }
      }
      let v: i32 = vals[vi];
      var dup: bool = false;
      var q: i32 = 0;
      for (q = 0; q < selN; q++) { if (sel[q] == v) { dup = true; break; } }
      if (!dup) { got = v; break; }
      guard++;
    }
    if (got < 0) { got = 1 + (i * 7) % redMax; }
    sel[selN] = got;
    selN++;
  }
  }
  for (i = 0; i < selN; i++) {
    var j2: i32 = 0;
    for (j2 = 0; j2 < selN - 1 - i; j2++) {
      if (sel[j2] > sel[j2 + 1]) {
        let t: i32 = sel[j2];
        sel[j2] = sel[j2 + 1];
        sel[j2 + 1] = t;
      }
    }
  }
  var sum: i32 = 0;
  var odds: i32 = 0;
  var bigs: i32 = 0;
  var primes: i32 = 0;
  var z0: i32 = 0; var z1: i32 = 0; var z2: i32 = 0;
  var routes: array<i32, 3> = array<i32, 3>(0, 0, 0);
  var tails: array<i32, 10> = array<i32, 10>(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  var hotIn: i32 = 0;
  var coldIn: i32 = 0;
  var reps: i32 = 0;
  var omitOk: i32 = 0;
  var neighborIn: i32 = 0;
  var goldenIn: i32 = 0;
  var fiboHits: i32 = 0;
  var clampHits: i32 = 0;
  var diffMark: array<i32, 96> = array<i32, 96>(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
  for (i = 0; i < selN; i++) {
    let n: i32 = sel[i];
    sum += n;
    if (n % 2 == 1) { odds++; }
    if (n > sizeSplit) { bigs++; }
    if (maps[2 * redMax + n - 1] == 1) { primes++; }
    if (maps[n - 1] == 1) { hotIn++; }
    if (maps[redMax + n - 1] == 1) { coldIn++; }
    if (maps[3 * redMax + n - 1] == 1) { reps++; }
    if (maps[4 * redMax + n - 1] == 1) { neighborIn++; }
    if (maps[5 * redMax + n - 1] == 1) { goldenIn++; }
    if (maps[6 * redMax + n - 1] == 1) { clampHits++; }
    if (n <= zoneE0) { z0++; } else if (n <= zoneE1) { z1++; } else { z2++; }
    routes[n % 3]++;
    tails[n % 10]++;
    let om = omit[n];
    if (om >= 3.0 && om <= 15.0) { omitOk++; }
    if ((om >= 7.0 && om <= 9.0) || (om >= 12.0 && om <= 14.0) || (om >= 20.0 && om <= 22.0)) { fiboHits++; }
  }
  var k2: i32 = 0;
  for (i = 0; i < selN; i++) {
    for (k2 = i + 1; k2 < selN; k2++) {
      let d: i32 = sel[k2] - sel[i];
      if (d > 0) { diffMark[d] = 1; }
    }
  }
  var uniqueDiffs: i32 = 0;
  for (i = 0; i < 96; i++) { if (diffMark[i] == 1) { uniqueDiffs++; } }
  let ac: i32 = uniqueDiffs - (selN - 1);
  var mirrorPairs: i32 = 0;
  for (i = 0; i < selN; i++) {
    let p: i32 = mirrorVal - sel[i];
    if (p != sel[i] && p >= 1 && p <= redMax) {
      var has: bool = false;
      var q2: i32 = 0;
      for (q2 = 0; q2 < selN; q2++) { if (sel[q2] == p) { has = true; break; } }
      if (has) { mirrorPairs++; }
    }
  }
  mirrorPairs = mirrorPairs / 2;

  var zoneScore: f32 = 0.0;
  {
    var zs: array<i32, 3> = array<i32, 3>(z0, z1, z2);
    var ts: array<i32, 3> = array<i32, 3>(zoneT0, zoneT1, zoneT2);
    var zi: i32 = 0;
    for (zi = 0; zi < zoneCnt; zi++) {
      let tt: f32 = f32(ts[zi]);
      if (tt <= 0.0) { tt = 1.0; }
      zoneScore += max(0.0, 1.0 - abs(f32(zs[zi]) - tt) / tt);
    }
    zoneScore = zoneScore / f32(zoneCnt) * 100.0;
  }
  let targetOdd: i32 = (redCount + 1) / 2;
  let oddScore: f32 = max(0.0, 100.0 - abs(f32(odds) - f32(targetOdd)) * 25.0);
  let mid: f32 = (f32(sumMin) + f32(sumMax)) / 2.0;
  let sumScore: f32 = max(0.0, 100.0 - (abs(f32(sum) - mid) / f32(sumMax - sumMin)) * 220.0);
  var cons: i32 = 0;
  for (i = 1; i < selN; i++) { if (sel[i] - sel[i - 1] == 1) { cons++; } }
  let consScore: f32 = cons <= 1 ? 100.0 : max(0.0, 100.0 - f32(cons - 1) * 45.0);
  let hotScore: f32 = min(100.0, f32(hotIn) * 25.0 + f32(coldIn) * 10.0);
  let targetBig: i32 = (redCount + 1) / 2;
  let sizeScore: f32 = max(0.0, 100.0 - abs(f32(bigs) - f32(targetBig)) * 30.0);
  let primeScore: f32 = max(0.0, 100.0 - abs(f32(primes) - 2.0) * 28.0);
  let perRoute: f32 = f32(redCount) / 3.0;
  let routeScore: f32 = max(0.0, 100.0 - (abs(f32(routes[0]) - perRoute) + abs(f32(routes[1]) - perRoute) + abs(f32(routes[2]) - perRoute)) * 22.0);
  let span: i32 = sel[selN - 1] - sel[0];
  let spanScore: f32 = span >= spanMin && span <= spanMax ? 100.0 : max(0.0, 100.0 - min(60.0, abs(f32(span) - f32(spanMin + spanMax) / 2.0) * 6.0));
  var tailPairs: i32 = 0;
  for (i = 0; i < 10; i++) { tailPairs += max(0, tails[i] - 1); }
  let tailScore: f32 = max(0.0, 100.0 - f32(tailPairs) * 22.0);
  let repeatScore: f32 = reps <= 2 ? 100.0 : (reps == 3 ? 70.0 : max(0.0, 100.0 - f32(reps) * 18.0));
  let omitScore: f32 = omitOk >= 2 ? 100.0 : (omitOk == 1 ? 75.0 : 55.0);
  let acScore: f32 = ac >= 5 && ac <= 10 ? 100.0 : max(0.0, 100.0 - abs(f32(ac) - 7.0) * 12.0);
  let neighborScore: f32 = neighborIn == 2 ? 100.0 : (neighborIn == 1 ? 90.0 : (neighborIn == 0 ? 60.0 : max(0.0, 100.0 - f32(neighborIn - 2) * 25.0)));
  let goldenScore: f32 = goldenIn >= 1 && goldenIn <= 2 ? 100.0 : (goldenIn > 2 ? 80.0 : 60.0);
  let mirrorScore: f32 = mirrorPairs == 0 ? 100.0 : max(0.0, 100.0 - f32(mirrorPairs) * 45.0);
  let sumTail: i32 = sum % 10;
  let sumTailScore: f32 = sumTail >= 3 && sumTail <= 7 ? 100.0 : (sumTail == 0 || sumTail == 8 || sumTail == 9 ? 80.0 : 70.0);
  let meanScore: f32 = sumRecent > 0.0 ? max(0.0, 100.0 - min(60.0, (abs(f32(sum) - sumRecent) / 15.0) * 100.0)) : 80.0;
  let fiboScore: f32 = fiboHits >= 2 ? 100.0 : (fiboHits == 1 ? 85.0 : 65.0);
  let headOk: bool = sel[0] <= headEdge;
  let tailOk: bool = sel[selN - 1] >= 28;
  let headTailScore: f32 = (headOk && tailOk) ? 100.0 : (headOk || tailOk ? 80.0 : 55.0);
  let clampScore: f32 = clampHits <= 1 ? 100.0 : max(0.0, 100.0 - f32(clampHits - 1) * 35.0);

  var o: i32 = idx * need;
  for (i = 0; i < selN; i++) { outNums[o + i] = sel[i]; }
  var b: i32 = idx * 21;
  outParts[b + 0] = zoneScore;
  outParts[b + 1] = oddScore;
  outParts[b + 2] = sumScore;
  outParts[b + 3] = consScore;
  outParts[b + 4] = hotScore;
  outParts[b + 5] = sizeScore;
  outParts[b + 6] = primeScore;
  outParts[b + 7] = routeScore;
  outParts[b + 8] = spanScore;
  outParts[b + 9] = tailScore;
  outParts[b + 10] = repeatScore;
  outParts[b + 11] = omitScore;
  outParts[b + 12] = acScore;
  outParts[b + 13] = neighborScore;
  outParts[b + 14] = goldenScore;
  outParts[b + 15] = mirrorScore;
  outParts[b + 16] = sumTailScore;
  outParts[b + 17] = meanScore;
  outParts[b + 18] = fiboScore;
  outParts[b + 19] = headTailScore;
  outParts[b + 20] = clampScore;
}
`

const DIGIT_WGSL = `
@group(0) @binding(0) var<storage, read> posW: array<i32>;
@group(0) @binding(1) var<storage, read> posMark: array<i32>;
@group(0) @binding(2) var<storage, read> tailW: array<i32>;
@group(0) @binding(3) var<storage, read> tailFreq: array<i32>;
@group(0) @binding(4) var<storage, read> lastDigits: array<i32>;
@group(0) @binding(5) var<storage, read> sumTailFreq: array<i32>;
@group(0) @binding(6) var<storage, read> missVals: array<i32>;
@group(0) @binding(7) var<storage, read> params: array<f32>;
@group(0) @binding(8) var<storage, read_write> outNums: array<i32>;
@group(0) @binding(9) var<storage, read_write> outParts: array<f32>;
@group(0) @binding(10) var<storage, read> candsIn: array<i32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = i32(gid.x);
  if (idx >= i32(params[7])) { return; }
  let nPos = i32(params[0]);
  let hasTail = i32(params[1]);
  let tailMax = i32(params[2]);
  let sumMin = i32(params[3]);
  let sumMax = i32(params[4]);
  let total = i32(params[5]);
  var st: u32 = u32(params[6]) + u32(idx) * 2654435761u;
  var digs: array<i32, 16>;
  var tailVal: i32 = -1;
  var p: i32 = 0;
  if (i32(params[8]) == 1) {
    // 外部候选评分模式：直接从 candsIn 读取（每候选 nPos+1 个值：digits + tail）
    for (p = 0; p < nPos; p++) { digs[p] = candsIn[idx * (nPos + 1) + p]; }
    tailVal = candsIn[idx * (nPos + 1) + nPos];
  } else {
  for (p = 0; p < nPos; p++) {
    st = st * 1664525u + 1013904223u;
    let r: f32 = f32(st & 0xFFFFFFu) / 16777216.0;
    var acc: f32 = 0.0;
    var vi: i32 = 0;
    var j: i32 = 0;
    var wsum: i32 = 0;
    for (j = 0; j < 10; j++) { wsum += posW[p * 10 + j]; }
    for (j = 0; j < 10; j++) {
      acc += f32(posW[p * 10 + j]);
      if (r < acc) { vi = j; break; }
    }
    if (wsum <= 0) { vi = p % 10; }
    digs[p] = vi;
  }
  if (hasTail == 1) {
    st = st * 1664525u + 1013904223u;
    let r2: f32 = f32(st & 0xFFFFFFu) / 16777216.0;
    var acc2: f32 = 0.0;
    var vi2: i32 = 0;
    var j2: i32 = 0;
    var wsum2: i32 = 0;
    for (j2 = 0; j2 <= tailMax; j2++) { wsum2 += tailW[j2]; }
    for (j2 = 0; j2 <= tailMax; j2++) {
      acc2 += f32(tailW[j2]);
      if (r2 < acc2) { vi2 = j2; break; }
    }
    if (wsum2 <= 0) { vi2 = 0; }
    tailVal = vi2;
  }
  }
  var sum: i32 = 0;
  var odds: i32 = 0;
  var bigs: i32 = 0;
  var primes: i32 = 0;
  var hotRaw: f32 = 0.0;
  var reps: i32 = 0;
  var routes: array<i32, 3> = array<i32, 3>(0, 0, 0);
  var seen: array<i32, 10> = array<i32, 10>(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  var paired: i32 = 0;
  var penalty: f32 = 0.0;
  var digitCnt: array<i32, 10> = array<i32, 10>(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (p = 0; p < nPos; p++) {
    let v: i32 = digs[p];
    sum += v;
    if (v % 2 == 1) { odds++; }
    if (v >= 5) { bigs++; }
    if (v == 2 || v == 3 || v == 5 || v == 7) { primes++; }
    let mark: i32 = posMark[p * 10 + v];
    if (mark == 1 || mark == 2) { hotRaw += 1.0; }
    if (mark == -1 || mark == 2) { hotRaw -= 0.6; }
    if (lastDigits[p] == v) { reps++; }
    routes[v % 3]++;
    digitCnt[v]++;
    let mv: i32 = missVals[p * 10 + v];
    let m: i32 = mv == -1 ? total : total - mv;
    if (!(m >= 5 && m <= 20)) { penalty += 0.35; }
    let mp: i32 = v < 5 ? v + 5 : v - 5;
    if (seen[mp] == 1) { paired++; seen[mp] = 0; } else { seen[v] = 1; }
  }
  var uniqCount: i32 = 0;
  for (p = 0; p < 10; p++) { if (digitCnt[p] > 0) { uniqCount++; } }
  var srt: array<i32, 16>;
  for (p = 0; p < nPos; p++) { srt[p] = digs[p]; }
  for (p = 0; p < nPos; p++) {
    var q: i32 = 0;
    for (q = 0; q < nPos - 1 - p; q++) {
      if (srt[q] > srt[q + 1]) { let t: i32 = srt[q]; srt[q] = srt[q + 1]; srt[q + 1] = t; }
    }
  }
  let hotScore: f32 = max(0.0, min(100.0, 60.0 + hotRaw * 25.0));
  let mid: f32 = (f32(sumMin) + f32(sumMax)) / 2.0;
  let sumScore: f32 = max(0.0, 100.0 - (abs(f32(sum) - mid) / max(1.0, f32(sumMax - sumMin) / 2.0)) * 55.0);
  let target: f32 = f32(nPos) / 2.0;
  let oddScore: f32 = max(0.0, 100.0 - abs(f32(odds) - target) * 30.0);
  let sizeScore: f32 = max(0.0, 100.0 - abs(f32(bigs) - target) * 30.0);
  let formScore: f32 = uniqCount == 1 ? 55.0 : (uniqCount == 2 ? 85.0 : 95.0);
  let repeatScore: f32 = reps <= 1 ? 100.0 : max(0.0, 100.0 - f32(reps) * 30.0);
  let span: i32 = srt[nPos - 1] - srt[0];
  let spanScore: f32 = span >= 2 && span <= 8 ? 100.0 : max(0.0, 100.0 - abs(f32(span) - 5.0) * 10.0);
  let tailScore: f32 = (hasTail == 1 && tailVal >= 0) ? max(0.0, min(100.0, 60.0 + f32(tailFreq[tailVal]) * 8.0)) : 100.0;
  var routeUniq: i32 = 0;
  if (routes[0] > 0) { routeUniq++; }
  if (routes[1] > 0) { routeUniq++; }
  if (routes[2] > 0) { routeUniq++; }
  let routeScore: f32 = routeUniq >= 3 ? 100.0 : max(0.0, 100.0 - f32(3 - routeUniq) * 25.0);
  let primeScore: f32 = max(0.0, 100.0 - abs(f32(primes) - target) * 30.0);
  let mirrorScore: f32 = paired >= nPos / 2 ? 100.0 : max(0.0, 100.0 - (f32(nPos / 2) - f32(paired)) * 40.0);
  let headTailScore: f32 = nPos >= 2 ? max(0.0, min(100.0, 50.0 + max(0.0, f32(3 - digs[0])) * 10.0 + max(0.0, f32(digs[nPos - 1] - 6)) * 10.0)) : 100.0;
  let sumTailF: i32 = sumTailFreq[sum % 10];
  let sumTailScore: f32 = max(0.0, min(100.0, 60.0 + f32(sumTailF) * 6.0));
  let omitScore: f32 = max(0.0, min(100.0, 100.0 - penalty * 20.0));

  var o: i32 = idx * (nPos + 1);
  for (p = 0; p < nPos; p++) { outNums[o + p] = digs[p]; }
  outNums[o + nPos] = tailVal;
  var b: i32 = idx * 14;
  outParts[b + 0] = hotScore;
  outParts[b + 1] = sumScore;
  outParts[b + 2] = oddScore;
  outParts[b + 3] = sizeScore;
  outParts[b + 4] = formScore;
  outParts[b + 5] = repeatScore;
  outParts[b + 6] = spanScore;
  outParts[b + 7] = tailScore;
  outParts[b + 8] = routeScore;
  outParts[b + 9] = primeScore;
  outParts[b + 10] = mirrorScore;
  outParts[b + 11] = headTailScore;
  outParts[b + 12] = sumTailScore;
  outParts[b + 13] = omitScore;
}
`

/* ==================== 编码（stats → GPU 查表） ==================== */
export function encodeComboPrep(cfg, stats) {
  const redMax = cfg.redMax
  const need = cfg.redCount
  const hotSet = new Set(stats.hot || [])
  const coldSet = new Set(stats.cold || [])
  const vals = []
  const w = []
  for (let n = 1; n <= redMax; n++) {
    let wt = 2
    if (hotSet.has(n)) wt = 4
    if (coldSet.has(n)) wt = 1
    vals.push(n)
    w.push(wt)
  }
  const maps = new Int32Array(7 * redMax)
  const put = (off, set) => {
    for (const n of set) if (n >= 1 && n <= redMax) maps[off * redMax + n - 1] = 1
  }
  put(0, stats.hot)
  put(1, stats.cold)
  put(2, [...PRIMES].filter((n) => n <= redMax))
  put(3, stats.lastRed)
  const neighborSet = new Set()
  ;(stats.lastRed || []).forEach((n) => { neighborSet.add(n - 1); neighborSet.add(n + 1) })
  put(4, neighborSet)
  const g1 = Math.round(redMax * 0.382)
  const g2 = Math.round(redMax * 0.618)
  const goldenSet = new Set()
  for (let n = 1; n <= redMax; n++) if (Math.abs(n - g1) <= 2 || Math.abs(n - g2) <= 2) goldenSet.add(n)
  put(5, goldenSet)
  const clampSet = new Set()
  const lr = (stats.lastRed || []).slice().sort((a, b) => a - b)
  for (let i = 0; i < lr.length - 1; i++) {
    const a = lr[i]; const b = lr[i + 1]
    if (b - a > 1) for (let n = a + 1; n < b; n++) clampSet.add(n)
  }
  put(6, clampSet)
  const omit = new Float32Array(redMax + 1)
  for (let n = 1; n <= redMax; n++) omit[n] = (stats.omitVal && stats.omitVal[n]) || 0
  const headEdge = redMax <= 33 ? 9 : 11
  const params = new Float32Array(22)
  params[0] = vals.length
  params[1] = w.reduce((a, b) => a + b, 0)
  params[2] = need
  params[3] = redMax
  params[4] = cfg.redCount
  params[5] = cfg.zoneEdges[0]
  params[6] = cfg.zoneEdges[1]
  params[7] = cfg.zoneTarget[0]
  params[8] = cfg.zoneTarget[1]
  params[9] = cfg.zoneTarget[2]
  params[10] = cfg.zoneTarget.length
  params[11] = cfg.sumMin
  params[12] = cfg.sumMax
  params[13] = cfg.sizeSplit || Math.floor(redMax / 2)
  params[14] = cfg.spanMin != null ? cfg.spanMin : 16
  params[15] = cfg.spanMax != null ? cfg.spanMax : 30
  params[16] = stats.sumRecent || 0
  params[17] = redMax + 1
  params[18] = headEdge
  return { vals, w, maps, omit, params, need, redMax }
}

export function encodeDirectPrep(cfg, stats) {
  const nPos = cfg.digits.length
  const posW = new Int32Array(nPos * 10).fill(2)
  const posMark = new Int32Array(nPos * 10)
  for (let p = 0; p < nPos; p++) {
    const hot = stats.hotPos[p] || []
    const cold = stats.coldPos[p] || []
    // 热冷交集：mark=2 表示既热又冷，CPU scoreDigits 双 if 均生效（+1 且 -0.6）
    for (const v of hot) { posW[p * 10 + v] = 4; posMark[p * 10 + v] = posMark[p * 10 + v] === -1 ? 2 : 1 }
    for (const v of cold) { posW[p * 10 + v] = 1; posMark[p * 10 + v] = posMark[p * 10 + v] === 1 ? 2 : -1 }
  }
  const hasTail = cfg.tailMax != null ? 1 : 0
  const tailMax = cfg.tailMax != null ? cfg.tailMax : 0
  const tailW = new Int32Array(Math.max(1, tailMax + 1)).fill(2)
  const tailFreq = new Int32Array(Math.max(1, tailMax + 1))
  if (hasTail && stats.tailFreq) {
    for (let t = 0; t <= tailMax; t++) {
      tailFreq[t] = stats.tailFreq[t] || 0
      if (stats.tailFreq[t] >= 3) tailW[t] = 4
    }
  }
  const lastDigits = new Int32Array(nPos)
  for (let p = 0; p < nPos; p++) lastDigits[p] = stats.lastDigits[p] != null ? stats.lastDigits[p] : -1
  const sumTailFreq = new Int32Array(10)
  for (let t = 0; t < 10; t++) sumTailFreq[t] = stats.sumTailFreq[t] || 0
  const missVals = new Int32Array(nPos * 10).fill(-1)
  for (let p = 0; p < nPos; p++) {
    for (let v = 0; v < 10; v++) {
      const mv = stats.miss[p] != null ? stats.miss[p][v] : -1
      missVals[p * 10 + v] = mv
    }
  }
  const params = new Float32Array(10)
  params[0] = nPos
  params[1] = hasTail
  params[2] = tailMax
  params[3] = cfg.sumMin
  params[4] = cfg.sumMax
  params[5] = stats.total || 0
  return { posW, posMark, tailW, tailFreq, lastDigits, sumTailFreq, missVals, params, nPos }
}

/* ==================== CPU 端评分复刻（对照/合成/校验用） ==================== */
export function composeRedTotal(parts) {
  // 兼容传入 score 对象（含 parts 数组）与直接传入 parts 数组
  const arr = Array.isArray(parts) ? parts : (parts && parts.parts) || []
  let t = 0
  for (let i = 0; i < 21; i++) t += arr[i] * RED_W[i]
  return Math.round(t)
}

export function composeDigitTotal(parts) {
  // 兼容传入 score 对象（含 parts 数组）与直接传入 parts 数组
  const arr = Array.isArray(parts) ? parts : (parts && parts.parts) || []
  let t = 0
  for (let i = 0; i < 14; i++) t += arr[i] * DIGIT_W[i]
  return Math.round(t)
}

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

/** CPU 复刻 scoreRed（用于 L2 生成校验 + benchmark CPU 对照 + 一致性校验） */
export function scoreRedCPU(cfg, red, s) {
  const zones = [0, 0, 0]
  red.forEach((n) => { const z = n <= cfg.zoneEdges[0] ? 0 : n <= cfg.zoneEdges[1] ? 1 : 2; zones[z]++ })
  let zoneScore = 0
  cfg.zoneTarget.forEach((t, i) => { zoneScore += Math.max(0, 1 - Math.abs(zones[i] - t) / t) })
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
  const hotIn = red.filter((n) => (s.hot || []).includes(n)).length
  const coldIn = red.filter((n) => (s.cold || []).includes(n)).length
  const hotScore = Math.min(100, hotIn * 25 + coldIn * 10)
  const sizeSplit = cfg.sizeSplit || Math.floor(cfg.redMax / 2)
  const bigs = red.filter((n) => n > sizeSplit).length
  const targetBig = Math.round(cfg.redCount / 2)
  const sizeScore = Math.max(0, 100 - Math.abs(bigs - targetBig) * 30)
  const primes = red.filter((n) => PRIMES.has(n)).length
  const primeScore = Math.max(0, 100 - Math.abs(primes - 2) * 28)
  const routes = [0, 0, 0]
  red.forEach((n) => routes[n % 3]++)
  const perRoute = cfg.redCount / 3
  const routeScore = Math.max(0, 100 - routes.reduce((a, c) => a + Math.abs(c - perRoute), 0) * 22)
  const span = sorted[sorted.length - 1] - sorted[0]
  const spanMin = cfg.spanMin != null ? cfg.spanMin : 16
  const spanMax = cfg.spanMax != null ? cfg.spanMax : 30
  const spanScore = span >= spanMin && span <= spanMax ? 100 : Math.max(0, 100 - Math.min(60, Math.abs(span - (spanMin + spanMax) / 2) * 6))
  const tails = new Array(10).fill(0)
  red.forEach((n) => tails[n % 10]++)
  const tailPairs = tails.reduce((a, c) => a + Math.max(0, c - 1), 0)
  const tailScore = Math.max(0, 100 - tailPairs * 22)
  let reps = 0
  if (s.lastRed && s.lastRed.length) red.forEach((n) => { if (s.lastRed.includes(n)) reps++ })
  const repeatScore = reps <= 2 ? 100 : reps === 3 ? 70 : Math.max(0, 100 - reps * 18)
  const omitOk = red.filter((n) => (s.omitVal && s.omitVal[n] >= 3 && s.omitVal[n] <= 15)).length
  const omitScore = omitOk >= 2 ? 100 : omitOk === 1 ? 75 : 55
  const diffSet = new Set()
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) diffSet.add(sorted[j] - sorted[i])
  const ac = diffSet.size - (sorted.length - 1)
  const acScore = ac >= 5 && ac <= 10 ? 100 : Math.max(0, 100 - Math.abs(ac - 7) * 12)
  const neighborIn = red.filter((n) => (s.lastRed || []).includes(n - 1) || (s.lastRed || []).includes(n + 1)).length
  const neighborScore = neighborIn === 2 ? 100 : neighborIn === 1 ? 90 : neighborIn === 0 ? 60 : Math.max(0, 100 - (neighborIn - 2) * 25)
  const goldenIn = red.filter((n) => Math.abs(n - Math.round(cfg.redMax * 0.382)) <= 2 || Math.abs(n - Math.round(cfg.redMax * 0.618)) <= 2).length
  const goldenScore = goldenIn >= 1 && goldenIn <= 2 ? 100 : goldenIn > 2 ? 80 : 60
  const mirrorVal = cfg.redMax + 1
  let mirrorPairs = 0
  red.forEach((n) => { const p = mirrorVal - n; if (p !== n && p >= 1 && p <= cfg.redMax && red.includes(p)) mirrorPairs++ })
  mirrorPairs = Math.floor(mirrorPairs / 2)
  const mirrorScore = mirrorPairs === 0 ? 100 : Math.max(0, 100 - mirrorPairs * 45)
  const sumTail = sum % 10
  const sumTailScore = sumTail >= 3 && sumTail <= 7 ? 100 : sumTail === 0 || sumTail === 8 || sumTail === 9 ? 80 : 70
  const sumRecent = s.sumRecent || 0
  const meanScore = sumRecent > 0 ? Math.max(0, 100 - Math.min(60, (Math.abs(sum - sumRecent) / 15) * 100)) : 80
  const fiboHits = red.filter((n) => {
    const om = (s.omitVal && s.omitVal[n]) || 0
    return (om >= 7 && om <= 9) || (om >= 12 && om <= 14) || (om >= 20 && om <= 22)
  }).length
  const fiboScore = fiboHits >= 2 ? 100 : fiboHits === 1 ? 85 : 65
  const headOk = sorted[0] <= (cfg.redMax <= 33 ? 9 : 11)
  const tailOk = sorted[sorted.length - 1] >= 28
  const headTailScore = headOk && tailOk ? 100 : headOk || tailOk ? 80 : 55
  const clampHits = red.filter((n) => {
    const lr2 = (s.lastRed || []).slice().sort((a, b) => a - b)
    for (let i = 0; i < lr2.length - 1; i++) if (lr2[i + 1] - lr2[i] > 1 && n > lr2[i] && n < lr2[i + 1]) return true
    return false
  }).length
  const clampScore = clampHits <= 1 ? 100 : Math.max(0, 100 - (clampHits - 1) * 35)
  const parts = [zoneScore, oddScore, sumScore, consScore, hotScore, sizeScore, primeScore, routeScore, spanScore, tailScore, repeatScore, omitScore, acScore, neighborScore, goldenScore, mirrorScore, sumTailScore, meanScore, fiboScore, headTailScore, clampScore]
  return { zones, odds, sum, cons, hotIn, coldIn, bigs, primes, routes, span, tailPairs, reps, omitOk, ac,
    neighborIn, goldenIn, mirrorPairs, sumTail, meanScore, fiboHits, headOk, tailOk, clampHits,
    zoneScore, oddScore, sumScore, consScore, hotScore, sizeScore, primeScore, routeScore, spanScore, tailScore, repeatScore, omitScore, acScore,
    neighborScore, goldenScore, mirrorScore, sumTailScore, meanScore, fiboScore, headTailScore, clampScore, parts, total: composeRedTotal(parts) }
}

/* ==================== 检测 ==================== */
async function readWebGPUNames(adapter) {
  try {
    const info = adapter.info
    _state.adapterInfo = info
    const vendor = info.vendor ? info.vendor + ' ' : ''
    return vendor + (info.architecture || '') + ' ' + (info.device || '').trim()
  } catch (e) {
    return ''
  }
}

function readWebGLRenderer() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  } catch (e) {
    return ''
  }
}

async function ensureWebGPU() {
  try {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') return false
    const adapter = await requestAdapterWithPref()
    if (!adapter) return false
    const device = await adapter.requestDevice()
    if (!device) return false
    _state.webgpuDevice = device
    _state.adapterInfo = adapter.info
    _state.gpuName = (await readWebGPUNames(adapter)) || readWebGLRenderer()
    _state.redPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: RED_WGSL }), entryPoint: 'main' } })
    _state.digitPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: DIGIT_WGSL }), entryPoint: 'main' } })
    return true
  } catch (e) {
    console.warn('[gpu-engine] WebGPU init failed:', e)
    return false
  }
}

async function ensureGPUJS() {
  try {
    const gpu = new GPU()
    if (typeof gpu.createKernel !== 'function') { if (gpu.destroy) gpu.destroy(); return false }
    const testKernel = gpu.createKernel(function (a) { return a[this.thread.x] * 2 }).setOutput([4])
    const res = testKernel([1, 2, 3, 4])
    if (!res || res[0] !== 2) { if (gpu.destroy) gpu.destroy(); return false }
    _state.gpuJs = gpu
    _state.gpuJsKernels = { combo: null, direct: null }
    if (!_state.gpuName) _state.gpuName = readWebGLRenderer()
    return true
  } catch (e) {
    console.warn('[gpu-engine] GPU.js init failed:', e)
    return false
  }
}

/* ==================== 手动选择：GPU 枚举与偏好 ==================== */
// Electron getGPUInfo 在 Windows 上常缺失 deviceString/type 等字符串字段，仅剩 vendorId/deviceId 数字；
// 用映射表识别常见型号，未命中时用 WebGL 真实渲染名兜底。
const GPU_VENDOR_NAMES = { 4318: 'NVIDIA', 32902: 'Intel', 4098: 'AMD', 1002: 'AMD', 5140: 'Microsoft' }
const GPU_NAME_MAP = {
  // NVIDIA (0x10DE)
  '4318:9348': 'NVIDIA GeForce RTX 3070',
  '4318:9350': 'NVIDIA GeForce RTX 3070 Ti',
  '4318:9346': 'NVIDIA GeForce RTX 3060 Ti',
  '4318:9475': 'NVIDIA GeForce RTX 3060',
  '4318:8708': 'NVIDIA GeForce RTX 3090',
  '4318:8710': 'NVIDIA GeForce RTX 3080',
  '4318:8703': 'NVIDIA GeForce RTX 2080 Ti',
  '4318:8623': 'NVIDIA GeForce GTX 1080 Ti',
  '4318:8917': 'NVIDIA GeForce RTX 4060',
  '4318:8921': 'NVIDIA GeForce RTX 4060 Ti',
  '4318:8893': 'NVIDIA GeForce RTX 4070',
  '4318:8895': 'NVIDIA GeForce RTX 4070 Ti',
  '4318:8891': 'NVIDIA GeForce RTX 4080',
  '4318:8890': 'NVIDIA GeForce RTX 4090',
  // Intel (0x8086) 核显
  '32902:18048': 'Intel UHD Graphics 770',
  '32902:18047': 'Intel UHD Graphics 730',
  '32902:13826': 'Intel Iris Xe Graphics',
  '32902:16371': 'Intel UHD Graphics 630',
  // AMD (0x1002)
  '4098:29663': 'AMD Radeon RX 6700 XT',
  '4098:29687': 'AMD Radeon RX 6800 XT',
  '4098:29702': 'AMD Radeon RX 7900 XTX'
}
const GPU_INTEGRATED = new Set(['32902:18048', '32902:18047', '32902:13826', '32902:16371'])

function lookupGPUName(vendorId, deviceId) {
  if (!vendorId) return ''
  const key = String(vendorId) + ':' + String(deviceId)
  if (GPU_NAME_MAP[key]) return GPU_NAME_MAP[key]
  return GPU_VENDOR_NAMES[String(vendorId)] || ''
}

function lookupGPUIntegrated(vendorId, deviceId) {
  if (!vendorId) return false
  return GPU_INTEGRATED.has(String(vendorId) + ':' + String(deviceId))
}

function cleanRendererName(s) {
  let name = String(s || '').replace(/^ANGLE \(/, '').replace(/\)$/, '').trim()
  name = name.replace(/\s+(Direct3D|OpenGL|Vulkan).*$/i, '')
  const m = name.match(/(NVIDIA|AMD|Intel)[^,]*,\s*(.+)$/i)
  if (m) name = m[2].trim()
  return name
}

// 枚举全部 GPU 适配器：优先 Electron 主进程 app.getGPUInfo('complete') 的 gpuDevices（含核显），WebGL 兜底
async function fetchGPUDevices() {
  try {
    if (window.lotteryAPI && typeof window.lotteryAPI.gpuInfo === 'function') {
      const info = await window.lotteryAPI.gpuInfo('complete')
      const devs = (info && info.gpuDevices) || []
      if (devs.length) {
        const webglName = cleanRendererName(readWebGLRenderer())
        const seen = new Set()
        const out = []
        for (const d of devs) {
          const type = d.deviceType || 'other'
          if (type === 'cpu') continue
          // Microsoft Basic Render Driver / WARP 软件渲染，非物理 GPU
          if (d.vendorId === 5140) continue
          const vid = d.vendorId || 0
          const did = d.deviceId || 0
          const key = String(vid) + ':' + String(did)
          // 同一物理卡在 DXGI 中可能重复枚举（不同 gpuPreference），保留首个（active 优先）
          if (seen.has(key)) continue
          seen.add(key)
          let name = String(d.deviceName || d.deviceString || '').replace(/^ANGLE \(/, '').replace(/\)$/, '').trim()
          if (!name) name = lookupGPUName(vid, did)
          if (!name && d.active !== false && webglName) name = webglName
          out.push({
            index: d.index != null ? d.index : out.length,
            name: name || ('GPU ' + out.length),
            vendorId: vid,
            deviceId: did,
            deviceType: type,
            isIntegrated: !!d.isIntegrated || type === 'integrated-gpu' || lookupGPUIntegrated(vid, did),
            active: d.active !== false
          })
        }
        _state.gpuDevices = out
        if (out.length) return _state.gpuDevices
      }
    }
  } catch (e) {
    console.warn('[gpu-engine] IPC gpuInfo failed:', e)
  }
  // WebGL 兜底：至少识别到一个渲染设备
  const renderer = readWebGLRenderer()
  if (renderer) {
    const name = cleanRendererName(renderer)
    _state.gpuDevices = [{ index: 0, name: name || 'GPU 0', vendorId: 0, deviceId: 0, isIntegrated: false, active: true }]
  } else {
    _state.gpuDevices = []
  }
  return _state.gpuDevices
}

// 设备 → powerPreference 映射：核显 low-power，独显 high-performance
function devicePowerPreference(dev) {
  if (!dev) return 'default'
  if (dev.isIntegrated) return 'low-power'
  const n = (dev.name || '').toLowerCase()
  const igpu = /intel|uhd|hd graphics|iris|integrated|vega graphics/
  const dgpu = /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|amd radeon/
  if (igpu.test(n) && !dgpu.test(n)) return 'low-power'
  return 'high-performance'
}

// 按用户选择的 GPU 映射 powerPreference 请求 WebGPU adapter
async function requestAdapterWithPref() {
  const idx = getPreferredDeviceIndex()
  const dev = _state.gpuDevices.find((d) => d.index === idx) || null
  const power = devicePowerPreference(dev)
  let adapter = null
  if (power !== 'default') {
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: power }) } catch (e) { adapter = null }
  }
  if (!adapter) {
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) } catch (e) { adapter = null }
  }
  if (!adapter) {
    try { adapter = await navigator.gpu.requestAdapter() } catch (e) { adapter = null }
  }
  return adapter
}

// 方案 / 设备偏好读写（localStorage）
export function getPreferredScheme() {
  try {
    const v = localStorage.getItem(GPU_SCHEME_KEY)
    return SCHEMES[v] ? v : SCHEMES.AUTO
  } catch (e) {
    return SCHEMES.AUTO
  }
}

export function getPreferredDeviceIndex() {
  try {
    const v = parseInt(localStorage.getItem(GPU_DEVICE_KEY) || '-1', 10)
    return Number.isFinite(v) ? v : -1
  } catch (e) {
    return -1
  }
}

export function setGPUPreference(scheme, deviceIndex) {
  try {
    if (SCHEMES[scheme]) localStorage.setItem(GPU_SCHEME_KEY, scheme)
    const idx = Number(deviceIndex)
    if (Number.isFinite(idx) && idx >= 0) localStorage.setItem(GPU_DEVICE_KEY, String(idx))
    else localStorage.removeItem(GPU_DEVICE_KEY)
  } catch (e) { /* ignore */ }
}

/**
 * 初始化加速引擎。force=true 时按 localStorage 中用户锁定的方案/GPU 重新探测：
 * - scheme=webgpu / gpu.js / worker：只尝试该方案，不可用则置 CPU 并写 schemeError（不再自动降到其它 GPU 层）
 * - scheme=cpu：直接置 CPU（相当于关闭 GPU 方案）
 * - scheme=auto：保持原四层逐级降级
 * GPU 选择经 requestAdapterWithPref 映射 powerPreference（独显 high-performance / 核显 low-power）。
 */
export async function initGPU(force = false) {
  if (_state.detecting && !force) return _state
  _state.detecting = true
  _state.level = LEVELS.CPU
  _state.ready = false
  _state.schemeError = ''
  _state.deviceError = ''
  const scheme = getPreferredScheme()
  _state.scheme = scheme
  await fetchGPUDevices(force)
  const deviceIdx = getPreferredDeviceIndex()
  const dev = _state.gpuDevices.find((d) => d.index === deviceIdx)
  if (deviceIdx >= 0 && !dev) _state.deviceError = '所选 GPU 不可用，已回退自动'

  if (scheme === LEVELS.CPU) {
    // 用户锁定 CPU（不使用 GPU）
  } else if (scheme === LEVELS.WEBGPU) {
    if (await ensureWebGPU()) {
      _state.level = LEVELS.WEBGPU
    } else {
      _state.schemeError = 'WebGPU 不可用，已回退 CPU'
    }
  } else if (scheme === LEVELS.GPUJS) {
    if (await ensureGPUJS()) {
      _state.level = LEVELS.GPUJS
    } else {
      _state.schemeError = 'GPU.js 不可用，已回退 CPU'
    }
  } else if (scheme === LEVELS.WORKER) {
    if (typeof Worker !== 'undefined') {
      _state.level = LEVELS.WORKER
    } else {
      _state.schemeError = 'Worker 不可用，已回退 CPU'
    }
  } else {
    // auto：原四层逐级降级
    if (await ensureWebGPU()) {
      _state.level = LEVELS.WEBGPU
    } else if (await ensureGPUJS()) {
      _state.level = LEVELS.GPUJS
    } else if (typeof Worker !== 'undefined') {
      _state.level = LEVELS.WORKER
    }
  }
  _state.ready = true
  _state.detecting = false
  return _state
}

export async function getGPUInfo() {
  if (!_state.ready) await initGPU()
  const devs = _state.gpuDevices.length ? _state.gpuDevices : await fetchGPUDevices()
  const deviceIdx = getPreferredDeviceIndex()
  return {
    level: _state.level,
    levelLabel: LEVEL_LABELS[_state.level],
    gpuName: _state.gpuName || '未知',
    adapterInfo: _state.adapterInfo || null,
    webglRenderer: _state.level === LEVELS.GPUJS || !_state.gpuName ? readWebGLRenderer() : '',
    scheme: _state.scheme,
    schemeError: _state.schemeError,
    deviceError: _state.deviceError,
    devices: devs,
    deviceIndex: deviceIdx >= 0 && devs.some((d) => d.index === deviceIdx) ? deviceIdx : -1,
    selectedDevice: deviceIdx >= 0 ? (devs.find((d) => d.index === deviceIdx) || null) : null
  }
}

/* ==================== L1 WebGPU 执行器 ==================== */
async function webGPUBatch(prep, isDirect, batch, seed, extCands) {
  const device = _state.webgpuDevice
  const pipeline = isDirect ? _state.digitPipeline : _state.redPipeline
  const nOut = isDirect ? prep.nPos + 1 : prep.need
  const nParts = isDirect ? 14 : 21
  const params = new Float32Array(prep.params)
  if (isDirect) { params[6] = seed >>> 0; params[7] = batch; params[8] = extCands ? 1 : 0 } else { params[19] = batch; params[20] = seed >>> 0; params[21] = extCands ? 1 : 0 }
  let candsIn = null
  if (extCands) {
    if (isDirect) {
      candsIn = new Int32Array(batch * nOut)
      for (let i = 0; i < batch && i < extCands.length; i++) {
        for (let p = 0; p < prep.nPos; p++) candsIn[i * nOut + p] = extCands[i].digits[p]
        candsIn[i * nOut + prep.nPos] = extCands[i].tail == null ? -1 : extCands[i].tail
      }
    } else {
      candsIn = new Int32Array(batch * prep.need)
      for (let i = 0; i < batch && i < extCands.length; i++) {
        for (let k = 0; k < prep.need; k++) candsIn[i * prep.need + k] = extCands[i].red[k]
      }
    }
  }
  const mkIn = (data) => {
    const buf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(buf, 0, data)
    return buf
  }
  const outNumsBuf = device.createBuffer({ size: batch * nOut * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const outPartsBuf = device.createBuffer({ size: batch * nParts * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const ins = isDirect
    ? [prep.posW, prep.posMark, prep.tailW, prep.tailFreq, prep.lastDigits, prep.sumTailFreq, prep.missVals, params]
    : [Int32Array.from(prep.vals), Int32Array.from(prep.w), prep.maps, prep.omit, params]
  const entries = ins.map((d, i) => ({ binding: i, resource: { buffer: mkIn(d) } }))
  if (isDirect) {
    entries.push({ binding: 8, resource: { buffer: outNumsBuf } })
    entries.push({ binding: 9, resource: { buffer: outPartsBuf } })
    if (candsIn) entries.push({ binding: 10, resource: { buffer: mkIn(candsIn) } })
  } else {
    entries.push({ binding: 5, resource: { buffer: outNumsBuf } })
    entries.push({ binding: 6, resource: { buffer: outPartsBuf } })
    if (candsIn) entries.push({ binding: 7, resource: { buffer: mkIn(candsIn) } })
  }
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries
  })
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(Math.ceil(batch / 64))
  pass.end()
  device.queue.submit([encoder.finish()])
  const readNums = device.createBuffer({ size: batch * nOut * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
  const readParts = device.createBuffer({ size: batch * nParts * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
  const enc2 = device.createCommandEncoder()
  enc2.copyBufferToBuffer(outNumsBuf, 0, readNums, 0, readNums.size)
  enc2.copyBufferToBuffer(outPartsBuf, 0, readParts, 0, readParts.size)
  device.queue.submit([enc2.finish()])
  await Promise.all([readNums.mapAsync(GPUMapMode.READ), readParts.mapAsync(GPUMapMode.READ)])
  const nums = new Int32Array(readNums.getMappedRange())
  const parts = new Float32Array(readParts.getMappedRange())
  const numsCopy = nums.slice()
  const partsCopy = parts.slice()
  readNums.unmap()
  readParts.unmap()
  const cands = []
  for (let i = 0; i < batch; i++) {
    if (isDirect) {
      const digits = []
      for (let p = 0; p < prep.nPos; p++) digits.push(numsCopy[i * nOut + p])
      const tail = numsCopy[i * nOut + prep.nPos]
      const partArr = []
      for (let k = 0; k < 14; k++) partArr.push(partsCopy[i * 14 + k])
      cands.push({ digits, tail: tail < 0 ? null : tail, parts: partArr, total: composeDigitTotal(partArr) })
    } else {
      const red = []
      for (let k = 0; k < prep.need; k++) red.push(numsCopy[i * nOut + k])
      const partArr = []
      for (let k = 0; k < 21; k++) partArr.push(partsCopy[i * 21 + k])
      cands.push({ red, parts: partArr, total: composeRedTotal(partArr) })
    }
  }
  return cands
}

/* ==================== L2 GPU.js 执行器（CPU 生成候选 + GPU 评分输出总分） ==================== */
function createGPUJSComboKernel(gpu) {
  return gpu.createKernel(function (cands, maps, omit, params) {
    const i = this.thread.x
    const need = params[2]
    const redMax = params[3]
    const redCount = params[4]
    const zoneE0 = params[5]
    const zoneE1 = params[6]
    const zoneT0 = params[7]
    const zoneT1 = params[8]
    const zoneT2 = params[9]
    const zoneCnt = params[10]
    const sumMin = params[11]
    const sumMax = params[12]
    const sizeSplit = params[13]
    const spanMin = params[14]
    const spanMax = params[15]
    const sumRecent = params[16]
    const mirrorVal = params[17]
    const headEdge = params[18]
    const sel = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const base = i * need
    for (let q = 0; q < need; q++) sel[q] = cands[base + q]
    // 冒泡排序：与 WGSL 内核一致，保证 cons/span/headTail 等排序依赖项正确（外部候选可能无序）
    for (let q = 0; q < need; q++) {
      for (let r = 0; r < need - 1 - q; r++) {
        if (sel[r] > sel[r + 1]) {
          const t = sel[r]
          sel[r] = sel[r + 1]
          sel[r + 1] = t
        }
      }
    }
    let sum = 0
    let odds = 0
    let bigs = 0
    let primes = 0
    let z0 = 0
    let z1 = 0
    let z2 = 0
    let hotIn = 0
    let coldIn = 0
    let reps = 0
    let omitOk = 0
    let neighborIn = 0
    let goldenIn = 0
    let fiboHits = 0
    let clampHits = 0
    const routes = [0, 0, 0]
    const tails = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let q = 0; q < need; q++) {
      const n = sel[q]
      sum += n
      if (n % 2 === 1) odds++
      if (n > sizeSplit) bigs++
      if (maps[2 * redMax + n - 1] === 1) primes++
      if (maps[n - 1] === 1) hotIn++
      if (maps[redMax + n - 1] === 1) coldIn++
      if (maps[3 * redMax + n - 1] === 1) reps++
      if (maps[4 * redMax + n - 1] === 1) neighborIn++
      if (maps[5 * redMax + n - 1] === 1) goldenIn++
      if (maps[6 * redMax + n - 1] === 1) clampHits++
      if (n <= zoneE0) z0++
      else if (n <= zoneE1) z1++
      else z2++
      routes[n % 3]++
      tails[n % 10]++
      const om = omit[n]
      if (om >= 3 && om <= 15) omitOk++
      if ((om >= 7 && om <= 9) || (om >= 12 && om <= 14) || (om >= 20 && om <= 22)) fiboHits++
    }
    const diffMark = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let a = 0; a < need; a++) {
      for (let b = a + 1; b < need; b++) {
        const d = sel[b] - sel[a]
        if (d > 0) diffMark[d] = 1
      }
    }
    let uniqueDiffs = 0
    for (let a = 0; a < 96; a++) if (diffMark[a] === 1) uniqueDiffs++
    const ac = uniqueDiffs - (need - 1)
    let mirrorPairs = 0
    for (let a = 0; a < need; a++) {
      const p = mirrorVal - sel[a]
      if (p !== sel[a] && p >= 1 && p <= redMax) {
        let has = false
        for (let b = 0; b < need; b++) if (sel[b] === p) { has = true; break }
        if (has) mirrorPairs++
      }
    }
    mirrorPairs = Math.floor(mirrorPairs / 2)
    let zoneScore = 0
    const zs = [z0, z1, z2]
    const ts = [zoneT0, zoneT1, zoneT2]
    for (let zi = 0; zi < zoneCnt; zi++) {
      let tt = ts[zi]
      if (tt <= 0) tt = 1
      zoneScore += Math.max(0, 1 - Math.abs(zs[zi] - tt) / tt)
    }
    zoneScore = zoneScore / zoneCnt * 100
    const targetOdd = Math.round(redCount / 2)
    const oddScore = Math.max(0, 100 - Math.abs(odds - targetOdd) * 25)
    const mid = (sumMin + sumMax) / 2
    const sumScore = Math.max(0, 100 - (Math.abs(sum - mid) / (sumMax - sumMin)) * 220)
    let cons = 0
    for (let q = 1; q < need; q++) if (sel[q] - sel[q - 1] === 1) cons++
    const consScore = cons <= 1 ? 100 : Math.max(0, 100 - (cons - 1) * 45)
    const hotScore = Math.min(100, hotIn * 25 + coldIn * 10)
    const targetBig = Math.round(redCount / 2)
    const sizeScore = Math.max(0, 100 - Math.abs(bigs - targetBig) * 30)
    const primeScore = Math.max(0, 100 - Math.abs(primes - 2) * 28)
    const perRoute = redCount / 3
    const routeScore = Math.max(0, 100 - (Math.abs(routes[0] - perRoute) + Math.abs(routes[1] - perRoute) + Math.abs(routes[2] - perRoute)) * 22)
    const span = sel[need - 1] - sel[0]
    const spanScore = span >= spanMin && span <= spanMax ? 100 : Math.max(0, 100 - Math.min(60, Math.abs(span - (spanMin + spanMax) / 2) * 6))
    let tailPairs = 0
    for (let q = 0; q < 10; q++) tailPairs += Math.max(0, tails[q] - 1)
    const tailScore = Math.max(0, 100 - tailPairs * 22)
    const repeatScore = reps <= 2 ? 100 : reps === 3 ? 70 : Math.max(0, 100 - reps * 18)
    const omitScore = omitOk >= 2 ? 100 : omitOk === 1 ? 75 : 55
    const acScore = ac >= 5 && ac <= 10 ? 100 : Math.max(0, 100 - Math.abs(ac - 7) * 12)
    const neighborScore = neighborIn === 2 ? 100 : neighborIn === 1 ? 90 : neighborIn === 0 ? 60 : Math.max(0, 100 - (neighborIn - 2) * 25)
    const goldenScore = goldenIn >= 1 && goldenIn <= 2 ? 100 : goldenIn > 2 ? 80 : 60
    const mirrorScore = mirrorPairs === 0 ? 100 : Math.max(0, 100 - mirrorPairs * 45)
    const sumTail = sum % 10
    const sumTailScore = sumTail >= 3 && sumTail <= 7 ? 100 : sumTail === 0 || sumTail === 8 || sumTail === 9 ? 80 : 70
    const meanScore = sumRecent > 0 ? Math.max(0, 100 - Math.min(60, (Math.abs(sum - sumRecent) / 15) * 100)) : 80
    const fiboScore = fiboHits >= 2 ? 100 : fiboHits === 1 ? 85 : 65
    const headOk = sel[0] <= headEdge
    const tailOk = sel[need - 1] >= 28
    const headTailScore = (headOk && tailOk) ? 100 : (headOk || tailOk ? 80 : 55)
    const clampScore = clampHits <= 1 ? 100 : Math.max(0, 100 - (clampHits - 1) * 35)
    const W = [0.1, 0.08, 0.09, 0.05, 0.08, 0.08, 0.04, 0.06, 0.04, 0.04, 0.04, 0.03, 0.02, 0.04, 0.03, 0.02, 0.03, 0.04, 0.02, 0.04, 0.03]
    const P = [zoneScore, oddScore, sumScore, consScore, hotScore, sizeScore, primeScore, routeScore, spanScore, tailScore, repeatScore, omitScore, acScore, neighborScore, goldenScore, mirrorScore, sumTailScore, meanScore, fiboScore, headTailScore, clampScore]
    let t = 0
    for (let q = 0; q < 21; q++) t += P[q] * W[q]
    return Math.round(t)
  }).setOutput([4096])
}

function createGPUJSDirectKernel(gpu) {
  return gpu.createKernel(function (digs, posMark, tailFreq, lastDigits, sumTailFreq, missVals, params) {
    const i = this.thread.x
    const nPos = params[0]
    const hasTail = params[1]
    const tailMax = params[2]
    const sumMin = params[3]
    const sumMax = params[4]
    const total = params[5]
    let sum = 0
    let odds = 0
    let bigs = 0
    let primes = 0
    let hotRaw = 0
    let reps = 0
    let penalty = 0
    const routes = [0, 0, 0]
    const seen = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const digitCnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    let paired = 0
    const base = i * (nPos + 1)
    const tail = digs[base + nPos]
    const dig = []
    for (let p = 0; p < nPos; p++) dig.push(digs[base + p])
    for (let p = 0; p < nPos; p++) {
      const v = dig[p]
      sum += v
      if (v % 2 === 1) odds++
      if (v >= 5) bigs++
      if (v === 2 || v === 3 || v === 5 || v === 7) primes++
      const mark = posMark[p * 10 + v]
      if (mark === 1 || mark === 2) hotRaw += 1
      if (mark === -1 || mark === 2) hotRaw -= 0.6
      if (lastDigits[p] === v) reps++
      routes[v % 3]++
      digitCnt[v]++
      const mv = missVals[p * 10 + v]
      const m = mv === -1 ? total : total - mv
      if (!(m >= 5 && m <= 20)) penalty += 0.35
      const mp = v < 5 ? v + 5 : v - 5
      if (seen[mp] === 1) { paired++; seen[mp] = 0 } else { seen[v] = 1 }
    }
    let uniq = 0
    for (let p = 0; p < 10; p++) if (digitCnt[p] > 0) uniq++
    const srt = dig.slice().sort(function (a, b) { return a - b })
    const hotScore = Math.max(0, Math.min(100, 60 + hotRaw * 25))
    const mid = (sumMin + sumMax) / 2
    const sumScore = Math.max(0, 100 - (Math.abs(sum - mid) / Math.max(1, (sumMax - sumMin) / 2)) * 55)
    const target = nPos / 2
    const oddScore = Math.max(0, 100 - Math.abs(odds - target) * 30)
    const sizeScore = Math.max(0, 100 - Math.abs(bigs - target) * 30)
    const formScore = uniq === 1 ? 55 : uniq === 2 ? 85 : 95
    const repeatScore = reps <= 1 ? 100 : Math.max(0, 100 - reps * 30)
    const span = srt[nPos - 1] - srt[0]
    const spanScore = span >= 2 && span <= 8 ? 100 : Math.max(0, 100 - Math.abs(span - 5) * 10)
    const tailScore = (hasTail === 1 && tail >= 0) ? Math.max(0, Math.min(100, 60 + tailFreq[tail] * 8)) : 100
    let routeUniq = 0
    if (routes[0] > 0) routeUniq++
    if (routes[1] > 0) routeUniq++
    if (routes[2] > 0) routeUniq++
    const routeScore = routeUniq >= 3 ? 100 : Math.max(0, 100 - (3 - routeUniq) * 25)
    const primeScore = Math.max(0, 100 - Math.abs(primes - target) * 30)
    const mirrorScore = paired >= Math.floor(nPos / 2) ? 100 : Math.max(0, 100 - (Math.floor(nPos / 2) - paired) * 40)
    const headTailScore = nPos >= 2 ? Math.max(0, Math.min(100, 50 + Math.max(0, 3 - dig[0]) * 10 + Math.max(0, dig[nPos - 1] - 6) * 10)) : 100
    const stf = sumTailFreq[sum % 10]
    const sumTailScore = Math.max(0, Math.min(100, 60 + stf * 6))
    const omitScore = Math.max(0, Math.min(100, 100 - penalty * 20))
    const W = [0.18, 0.14, 0.1, 0.08, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.04, 0.04, 0.04, 0.02]
    const P = [hotScore, sumScore, oddScore, sizeScore, formScore, repeatScore, spanScore, tailScore, routeScore, primeScore, mirrorScore, headTailScore, sumTailScore, omitScore]
    let t = 0
    for (let q = 0; q < 14; q++) t += P[q] * W[q]
    return Math.round(t)
  }).setOutput([4096])
}

function ensureGPUJSKernels() {
  if (!_state.gpuJs) return null
  if (!_state.gpuJsKernels.combo) _state.gpuJsKernels.combo = createGPUJSComboKernel(_state.gpuJs)
  if (!_state.gpuJsKernels.direct) _state.gpuJsKernels.direct = createGPUJSDirectKernel(_state.gpuJs)
  return _state.gpuJsKernels
}

function gpuJsBatch(prep, isDirect, batch, seed, stats, extCands) {
  const kernels = ensureGPUJSKernels()
  if (!kernels) return null
  const cands = []
  const FIXED = 4096
  if (isDirect) {
    const nPos = prep.nPos
    const digs = new Float32Array(FIXED * (nPos + 1))
    for (let i = 0; i < FIXED; i++) {
      if (i >= batch) { digs[i * (nPos + 1)] = 0; continue }
      if (extCands && i < extCands.length) {
        const ec = extCands[i]
        for (let p = 0; p < nPos; p++) digs[i * (nPos + 1) + p] = ec.digits[p]
        digs[i * (nPos + 1) + nPos] = ec.tail == null ? -1 : ec.tail
        continue
      }
      let st = (seed >>> 0) + i * 2654435761
      for (let p = 0; p < nPos; p++) {
        st = (st * 1664525 + 1013904223) >>> 0
        const r = (st & 0xFFFFFF) / 16777216
        let acc = 0
        let vi = 0
        for (let j = 0; j < 10; j++) {
          acc += prep.posW[p * 10 + j]
          if (r < acc) { vi = j; break }
        }
        digs[i * (nPos + 1) + p] = vi
      }
      let tail = -1
      if (prep.params[1] === 1) {
        st = (st * 1664525 + 1013904223) >>> 0
        const r2 = (st & 0xFFFFFF) / 16777216
        let acc2 = 0
        let vi2 = 0
        const tmax = prep.params[2]
        for (let j = 0; j <= tmax; j++) {
          acc2 += prep.tailW[j]
          if (r2 < acc2) { vi2 = j; break }
        }
        tail = vi2
      }
      digs[i * (nPos + 1) + nPos] = tail
    }
    const params = new Float32Array(prep.params)
    const res = kernels.direct(digs, prep.posMark, prep.tailFreq, prep.lastDigits, prep.sumTailFreq, prep.missVals, params)
    for (let i = 0; i < batch; i++) {
      const digits = []
      for (let p = 0; p < nPos; p++) digits.push(Math.round(digs[i * (nPos + 1) + p]))
      const tail = Math.round(digs[i * (nPos + 1) + nPos])
      cands.push({ digits, tail: tail < 0 ? null : tail, total: res[i] })
    }
  } else {
    const need = prep.need
    const candsArr = new Float32Array(FIXED * need)
    for (let i = 0; i < FIXED; i++) {
      if (i >= batch) { candsArr[i * need] = 0; continue }
      if (extCands && i < extCands.length) {
        const ec = extCands[i]
        for (let k = 0; k < need; k++) candsArr[i * need + k] = ec.red[k]
        continue
      }
      const red = sampleUnique(prep.vals, prep.w, need, (seed >>> 0) + i * 2654435761)
      for (let k = 0; k < need; k++) candsArr[i * need + k] = red[k]
    }
    const params = new Float32Array(prep.params)
    const res = kernels.combo(candsArr, prep.maps, prep.omit, params)
    for (let i = 0; i < batch; i++) {
      const red = []
      for (let k = 0; k < need; k++) red.push(Math.round(candsArr[i * need + k]))
      cands.push({ red, total: res[i] })
    }
  }
  return cands
}

/* ==================== L3 Worker 执行器 ==================== */
function createWorkers() {
  const n = Math.min(4, Math.max(1, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4) - 1))
  const workers = []
  for (let i = 0; i < n; i++) {
    workers.push(new Worker(new URL('./gpu-worker.js', import.meta.url), { type: 'module' }))
  }
  return workers
}

function workerTask(worker, cfg, draws, isDirect, count, seed) {
  return new Promise((resolve) => {
    const candsAll = []
    worker.onmessage = (e) => {
      if (e.data && e.data.type === 'batch') candsAll.push(...e.data.cands)
      else if (e.data && e.data.type === 'done') {
        worker.terminate()
        resolve(candsAll)
      }
    }
    worker.postMessage({ type: 'start', cfg, draws, isDirect, count, seed: seed >>> 0 })
  })
}

async function workerBatch(cfg, draws, isDirect, count, seed, onBatch) {
  const workers = createWorkers()
  const per = Math.ceil(count / workers.length)
  const tasks = []
  for (let w = 0; w < workers.length; w++) {
    const wc = Math.min(per, count - w * per)
    if (wc <= 0) break
    tasks.push(workerTask(workers[w], cfg, draws, isDirect, wc, seed + w * 100000))
  }
  const all = await Promise.all(tasks)
  for (const cands of all) if (cands.length && onBatch) onBatch(cands)
  return all.reduce((a, c) => a.concat(c), [])
}

/* ==================== 统一批量入口 ==================== */
/**
 * 按当前层级跑一批候选（combo 或 direct）
 * prep 来自 encodeComboPrep / encodeDirectPrep
 */
async function runLayerBatch(cfg, draws, stats, isDirect, prep, batch, seed, extCands) {
  const level = _state.level
  if (level === LEVELS.WEBGPU && _state.webgpuDevice) {
    return webGPUBatch(prep, isDirect, batch, seed, extCands)
  }
  if (level === LEVELS.GPUJS && _state.gpuJs) {
    return gpuJsBatch(prep, isDirect, batch, seed, stats, extCands)
  }
  // worker：整批按 count 分片（batch 参数退化为分片数）；不支持外部候选评分
  if (extCands && extCands.length) return null
  const cands = await workerBatch(cfg, draws, isDirect, batch, seed)
  return cands
}

/**
 * 批量评分外部候选（复式/胆拖展开单注）：逐批 4096 调用 GPU 内核评分，
 * 返回 { ok, cands: [{red, blue, parts, total} | {digits, tail, parts, total}], level }。
 * 候选顺序与输入一致；total 为 GPU 内核分项加权合成总分（与 scoreRed/scoreDigits 一致）。
 */
export async function scoreCandidates(cfg, stats, candidates) {
  if (!candidates || !candidates.length) return { ok: false, error: 'empty candidates', level: _state.level }
  if (!_state.ready) await initGPU()
  if (_state.level === LEVELS.CPU || _state.level === LEVELS.WORKER) {
    return { ok: false, error: 'GPU 不可用（当前为 ' + LEVEL_LABELS[_state.level] + ' 层），外部候选评分请走 CPU', level: _state.level }
  }
  const isDirect = cfg.playMode === 'direct'
  const prep = isDirect ? encodeDirectPrep(cfg, stats) : encodeComboPrep(cfg, stats)
  const out = []
  const B = 4096
  for (let off = 0; off < candidates.length; off += B) {
    const chunk = candidates.slice(off, off + B)
    const cands = await runLayerBatch(cfg, null, stats, isDirect, prep, chunk.length, 1, chunk)
    if (!cands || !cands.length) return { ok: false, error: 'GPU 批处理失败', level: _state.level }
    out.push(...cands)
  }
  return { ok: true, cands: out, level: _state.level }
}

function genBlue(cfg, stats) {
  const blueCount = cfg.blueCount || 0
  if (!blueCount) return []
  const hotBlue = new Set(stats.hotBlue || [])
  const pool = []
  for (let b = 1; b <= cfg.blueMax; b++) {
    const w = hotBlue.has(b) ? 3 : 1
    for (let j = 0; j < w; j++) pool.push(b)
  }
  const out = []
  for (let i = 0; i < blueCount; i++) {
    let b = pool[Math.floor(Math.random() * pool.length)]
    if (out.includes(b) && pool.length > 1) b = pool[Math.floor(Math.random() * pool.length)]
    out.push(b)
  }
  return out.sort((a, b) => a - b)
}

/** 组组织：把候选按 n 个一组，挑最高平均分；支持 target / forceFull / collectFreq / onProgress / stopCheck */
export async function runBatch(cfg, draws, stats, opts) {
  const {
    playType = 'single', n = 1, count = 20000, target = 70,
    forceFull = false, collectFreq = false, onProgress = null, stopCheck = null,
    batchSize = 4096
  } = opts || {}
  const isDirect = cfg.playMode === 'direct'
  const prep = isDirect ? encodeDirectPrep(cfg, stats) : encodeComboPrep(cfg, stats)
  const seedBase = (Date.now() & 0x7fffffff) || 1
  let done = 0
  let best = null
  let hitOnce = false
  let stopped = false
  const freqMap = {}

  const accFreq = (c) => {
    if (!collectFreq) return
    if (!isDirect) {
      for (const r of c.red) freqMap['red_' + r] = (freqMap['red_' + r] || 0) + 1
      for (const b of c.blue || []) freqMap['blue_' + b] = (freqMap['blue_' + b] || 0) + 1
    } else {
      c.digits.forEach((v, p) => { freqMap['p_' + p + '_' + v] = (freqMap['p_' + p + '_' + v] || 0) + 1 })
      if (c.tail != null) freqMap['tail_' + c.tail] = (freqMap['tail_' + c.tail] || 0) + 1
    }
  }

  const processCands = (cands) => {
    const per = Math.max(1, playType === 'multi' ? n : 1)
    for (let i = 0; i + per <= cands.length; i += per) {
      const group = cands.slice(i, i + per)
      const gTotal = Math.round(group.reduce((a, c) => a + (c.total || 0), 0) / group.length)
      const gMax = Math.max(...group.map((c) => c.total || 0))
      const gMin = Math.min(...group.map((c) => c.total || 0))
      group.forEach(accFreq)
      done++
      if (!best || gTotal > best.total) {
        const ticket = isDirect
          ? (playType === 'multi' ? { type: 'multi', tickets: group.map((c) => ({ digits: c.digits, tail: c.tail })) } : { type: 'single', digits: group[0].digits, tail: group[0].tail })
          : (playType === 'multi' ? { type: 'multi', tickets: group.map((c) => ({ red: c.red, blue: c.blue })) } : { type: 'single', red: group[0].red, blue: group[0].blue })
        best = { ticket, total: gTotal, max: gMax, min: gMin, attempts: done }
      }
      if (best.total >= target) {
        hitOnce = true
        if (!forceFull) return false
      }
    }
    return true
  }

  // L3 worker 一次全量返回（兜底层，分片并行）
  if (_state.level === LEVELS.WORKER) {
    const all = await workerBatch(cfg, draws, isDirect, count, seedBase, null)
    processCands(all)
  } else {
    while (done < count) {
      const remain = count - done
      const per = Math.max(1, playType === 'multi' ? n : 1)
      const b = Math.min(batchSize, remain * per)
      let cands = []
      try {
        cands = await runLayerBatch(cfg, draws, stats, isDirect, prep, b, seedBase + done)
      } catch (e) {
        console.warn('[gpu-engine] batch failed, fallback:', e)
        return { ok: false, error: String(e), level: _state.level }
      }
      if (!cands || !cands.length) break
      if (onProgress && (done % 2000 === 0 || done + b / per >= count)) onProgress(Math.min(count, done + Math.floor(cands.length / per)))
      const cont = processCands(cands)
      if (!cont) break
      if (stopCheck && stopCheck()) { stopped = true; break }
    }
  }

  if (best) {
    best.hitTarget = hitOnce
    if (stopped) best.stopped = true
    else if (!hitOnce) best.attempts = count
  }
  return { ok: true, ...best, level: _state.level, freqMap, count, stopped, scheme: _state.scheme, deviceIndex: getPreferredDeviceIndex() }
}

/* ==================== 基准测试 ==================== */
export function makeSyntheticDraws(cfg, n = 60) {
  const draws = []
  const isDirect = cfg.playMode === 'direct'
  let seed = 123456789
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed & 0xFFFFFF) / 16777216
  }
  const pick = (max) => Math.floor(rnd() * max) + 1
  for (let i = 0; i < n; i++) {
    if (isDirect) {
      const digits = []
      for (let p = 0; p < cfg.digits.length; p++) digits.push(Math.floor(rnd() * 10))
      const d = { digits }
      if (cfg.tailMax != null) d.tail = Math.floor(rnd() * (cfg.tailMax + 1))
      draws.push(d)
    } else {
      const redSet = new Set()
      while (redSet.size < cfg.redCount) redSet.add(pick(cfg.redMax))
      const red = [...redSet].sort((a, b) => a - b)
      const d = { red }
      if (cfg.blueCount) {
        const blueSet = new Set()
        while (blueSet.size < cfg.blueCount) blueSet.add(pick(cfg.blueMax))
        d.blue = [...blueSet].sort((a, b) => a - b)
      }
      draws.push(d)
    }
  }
  return draws
}

/**
 * 基准测试：跑 count 次候选评分，输出 GPU vs CPU 耗时与加速比。
 * stats 由调用方通过 computeStats / computeDirectStats 构造（合成 draws 可用 makeSyntheticDraws 生成）。
 */
export async function runBenchmark(cfg, stats, count = 100000) {
  if (!_state.ready) await initGPU()
  if (_state.level === LEVELS.CPU) {
    return { ok: false, error: 'GPU 不可用（当前为 CPU 层）', level: _state.level }
  }
  const isDirect = cfg.playMode === 'direct'
  const prep = isDirect ? encodeDirectPrep(cfg, stats) : encodeComboPrep(cfg, stats)
  const seed = (Date.now() & 0x7fffffff) || 1
  let gpuMs = 0
  if (_state.level === LEVELS.WEBGPU || _state.level === LEVELS.GPUJS) {
    const t0 = performance.now()
    let done = 0
    while (done < count) {
      const b = Math.min(4096, count - done)
      await runLayerBatch(cfg, null, stats, isDirect, prep, b, seed + done)
      done += b
    }
    gpuMs = performance.now() - t0
  } else {
    const t0 = performance.now()
    await workerBatch(cfg, null, isDirect, count, seed, null)
    gpuMs = performance.now() - t0
  }
  // CPU 对照：scoreRedCPU / scoreDigits 等价复刻
  const t1 = performance.now()
  if (isDirect) {
    for (let i = 0; i < count; i++) {
      const digits = []
      for (let p = 0; p < cfg.digits.length; p++) digits.push((seed + i * 7 + p) % 10)
      const tail = cfg.tailMax != null ? (seed + i) % (cfg.tailMax + 1) : null
      scoreDigitsCPU(cfg, digits, tail, stats)
    }
  } else {
    for (let i = 0; i < count; i++) {
      const red = sampleUnique(prep.vals, prep.w, cfg.redCount, seed + i)
      scoreRedCPU(cfg, red, stats)
    }
  }
  const cpuMs = performance.now() - t1
  // 一致性校验：GPU 结果 vs CPU 复刻
  let maxErr = 0
  const check = await runLayerBatch(cfg, null, stats, isDirect, prep, Math.min(512, count), seed + 999)
  for (const c of check || []) {
    const cpu = isDirect ? scoreDigitsCPU(cfg, c.digits, c.tail, stats).total : scoreRedCPU(cfg, c.red, stats).total
    maxErr = Math.max(maxErr, Math.abs(cpu - c.total))
  }
  return {
    ok: true,
    level: _state.level,
    levelLabel: LEVEL_LABELS[_state.level],
    gpuName: _state.gpuName,
    count,
    gpuMs: +gpuMs.toFixed(1),
    cpuMs: +cpuMs.toFixed(1),
    speedup: +(cpuMs / Math.max(1, gpuMs)).toFixed(2),
    maxErr,
    scheme: _state.scheme,
    deviceIndex: getPreferredDeviceIndex()
  }
}

/** CPU 复刻 scoreDigits（benchmark 对照用） */
export function scoreDigitsCPU(cfg, digits, tail, s) {
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
  const formScore = uniq === 1 ? 55 : uniq === 2 ? 85 : 95
  let reps = 0
  digits.forEach((v, p) => { if (s.lastDigits[p] === v) reps++ })
  const repeatScore = reps <= 1 ? 100 : Math.max(0, 100 - reps * 30)
  const sorted = [...digits].sort((a, b) => a - b)
  const span = sorted[sorted.length - 1] - sorted[0]
  const spanScore = span >= 2 && span <= 8 ? 100 : Math.max(0, 100 - Math.abs(span - 5) * 10)
  const tailScore = cfg.tailMax != null && tail != null && s.tailFreq ? Math.max(0, Math.min(100, 60 + (s.tailFreq[tail] || 0) * 8)) : 100
  const routes = [0, 0, 0]
  digits.forEach((n) => routes[n % 3]++)
  const routeUniq = routes.filter((c) => c > 0).length
  const routeScore = routeUniq >= 3 ? 100 : Math.max(0, 100 - (3 - routeUniq) * 25)
  const primes = digits.filter((n) => [2, 3, 5, 7].includes(n)).length
  const primeScore = Math.max(0, 100 - Math.abs(primes - target) * 30)
  const mirrorPair = { 0: 5, 1: 6, 2: 7, 3: 8, 4: 9, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4 }
  const seen = new Set()
  let paired = 0
  digits.forEach((n) => {
    const m = mirrorPair[n]
    if (seen.has(m)) { paired++; seen.delete(m) } else seen.add(n)
  })
  const mirrorScore = paired >= Math.floor(digits.length / 2) ? 100 : Math.max(0, 100 - (Math.floor(digits.length / 2) - paired) * 40)
  const headTailScore = digits.length >= 2 ? Math.max(0, Math.min(100, 50 + Math.max(0, 3 - digits[0]) * 10 + Math.max(0, digits[digits.length - 1] - 6) * 10)) : 100
  const sumTailF = (s.sumTailFreq && s.sumTailFreq[sum % 10]) || 0
  const sumTailScore = Math.max(0, Math.min(100, 60 + sumTailF * 6))
  let penalty = 0
  digits.forEach((v, p) => {
    const mv = (s.miss[p] && s.miss[p][v]) != null ? s.miss[p][v] : -1
    const m = mv === -1 ? (s.total || 0) : (s.total || 0) - mv
    if (!(m >= 5 && m <= 20)) penalty += 0.35
  })
  const omitScore = Math.max(0, Math.min(100, 100 - penalty * 20))
  const parts = [hotScore, sumScore, oddScore, sizeScore, formScore, repeatScore, spanScore, tailScore, routeScore, primeScore, mirrorScore, headTailScore, sumTailScore, omitScore]
  return { hotScore, sumScore, oddScore, sizeScore, formScore, repeatScore, spanScore, tailScore, routeScore, primeScore, mirrorScore, headTailScore, sumTailScore, omitScore, parts, total: composeDigitTotal(parts), sum }
}
