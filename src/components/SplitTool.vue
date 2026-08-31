<template>
  <div>
    <div class="card-title">复式拆票 · 智能缩水</div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="输入一张复式/定位复式票，系统自动展开为全部单注；可启用智能缩水，按统计引擎评分保留 Top N 注，降低投注金额。"
      style="margin-bottom: 14px"
    />

    <div class="pick-panel">
      <template v-if="isDirect">
        <div v-for="(d, di) in cfg.digits" :key="'pos' + di" class="pos-zone">
          <div class="zone-label red-label">{{ d.label }}（可多选，多选即定位复式）</div>
          <div class="ball-pool">
            <button
              v-for="v in (d.max + 1)"
              :key="'p' + di + '_' + v"
              class="pool-btn"
              :class="{ picked: posSel[di] && posSel[di].includes(v - 1), 'btn-red': true }"
              @click="togglePos(di, v - 1)"
            >{{ v - 1 }}</button>
          </div>
        </div>
        <template v-if="cfg.tail != null">
          <div class="zone-label blue-label">尾位（0~{{ cfg.tailMax }}）</div>
          <div class="ball-pool">
            <button
              v-for="v in (cfg.tailMax + 1)"
              :key="'tail' + v"
              class="pool-btn"
              :class="{ picked: tailSel.includes(v - 1), 'btn-blue': true }"
              @click="toggleTail(v - 1)"
            >{{ v - 1 }}</button>
          </div>
        </template>
      </template>
      <template v-else>
        <div class="zone-label red-label">红球区（复式选 ≥{{ cfg.redCount }} 个）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'r' + n"
            class="pool-btn"
            :class="{ picked: redSel.includes(n), 'btn-red': true }"
            @click="toggleIn('red', n)"
          >{{ pad2(n) }}</button>
        </div>
        <div class="zone-label blue-label">蓝球区（选 ≥{{ cfg.blueCount }} 个）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.blueMax"
            :key="'b' + n"
            class="pool-btn"
            :class="{ picked: blueSel.includes(n), 'btn-blue': true }"
            @click="toggleIn('blue', n)"
          >{{ pad2(n) }}</button>
        </div>
      </template>

      <div class="pick-actions">
        <el-button size="small" @click="randomFill">随机补选</el-button>
        <el-button size="small" type="danger" plain @click="clearSel">清空</el-button>
        <el-button size="small" type="primary" :disabled="!selectionValid" @click="doExpand">展开拆票</el-button>
      </div>
    </div>

    <template v-if="expanded.length">
      <div class="summary-row">
        <div class="sum-card">
          <div class="sum-label">展开单注</div>
          <div class="sum-value">{{ expanded.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">全额投注金额</div>
          <div class="sum-value">¥{{ fullAmount }}</div>
        </div>
        <div class="sum-card" v-if="shrinkEnabled && shrunk.length">
          <div class="sum-label">缩水后注数</div>
          <div class="sum-value sum-accent">{{ shrunk.length }}</div>
        </div>
        <div class="sum-card" v-if="shrinkEnabled && shrunk.length">
          <div class="sum-label">缩水后金额</div>
          <div class="sum-value sum-accent">¥{{ shrunkAmount }}</div>
        </div>
        <div class="sum-card" v-if="shrinkEnabled && shrunk.length">
          <div class="sum-label">节省</div>
          <div class="sum-value sum-save">¥{{ fullAmount - shrunkAmount }}（{{ savePct }}%）</div>
        </div>
      </div>

      <div class="shrink-bar">
        <el-checkbox v-model="shrinkEnabled" size="small">启用智能缩水（按统计引擎评分保留高分单注）</el-checkbox>
        <template v-if="shrinkEnabled">
          <el-select v-model="shrinkMode" size="small" style="width: 150px; margin-left: 10px">
            <el-option label="保留 Top N 注" value="topN" />
            <el-option label="按预算金额" value="budget" />
          </el-select>
          <el-input-number
            v-if="shrinkMode === 'topN'"
            v-model="topN"
            :min="1"
            :max="Math.max(1, expanded.length)"
            size="small"
            style="width: 120px; margin-left: 8px"
          />
          <el-input-number
            v-else
            v-model="budget"
            :min="2"
            :max="99999"
            :step="2"
            size="small"
            style="width: 130px; margin-left: 8px"
          />
          <el-button size="small" type="primary" plain style="margin-left: 8px" @click="doShrink">应用缩水</el-button>
        </template>
        <el-button size="small" style="margin-left: auto" @click="exportCsv">导出 CSV</el-button>
        <el-button size="small" type="success" plain :disabled="!saveList.length" @click="saveToPicks">保存到自选号（{{ saveList.length }} 注）</el-button>
      </div>

      <div class="sub-title">单注列表（展示前 {{ shownLines.length }} / {{ saveList.length }} 注，按评分降序）</div>
      <div class="line-list">
        <div v-for="(line, i) in shownLines" :key="i" class="line-row">
          <span class="line-no dim">{{ saveIndex(line) }}</span>
          <template v-if="line.digits != null">
            <span v-for="(dv, di) in line.digits" :key="'d' + di" class="ball ball-red ball-sm">{{ dv }}</span>
            <span v-if="line.tail != null" class="ball ball-blue ball-sm">{{ line.tail }}</span>
          </template>
          <template v-else>
            <span v-for="n in line.red" :key="'r' + n" class="ball ball-red ball-sm">{{ pad2(n) }}</span>
            <span v-for="(b, i) in line.blue" :key="'b' + i" class="ball ball-blue ball-sm">{{ pad2(b) }}</span>
          </template>
          <span class="line-score" v-if="line.score != null">评分 {{ Math.round(line.score) }}</span>
        </div>
      </div>
      <div v-if="saveList.length > shownLines.length" class="dim" style="font-size: 12px; margin-top: 6px">
        共 {{ saveList.length }} 注，仅展示前 100 注预览；CSV 与保存为完整列表。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { pad2 } from '../utils/game-config'
import { expandTicket, calcPlay, scoreTicketPlay, computeDirectStats, scoreDigits } from '../utils/picker-engine'
import { checkTicketHistory, checkTicketHistoryMulti, isBigWin, bigWinFlow, fmtBonus } from '../utils/prize-check'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const isDirect = computed(() => props.cfg.playMode === 'direct')

const redSel = ref([])
const blueSel = ref([])
const posSel = ref([])
const tailSel = ref([])

const expanded = ref([])
const scored = ref([])
const shrinkEnabled = ref(true)
const shrinkMode = ref('topN')
const topN = ref(50)
const budget = ref(50)

const selectionValid = computed(() => {
  if (isDirect.value) {
    const ok = posSel.value.some((p) => p && p.length > 0)
    return ok
  }
  return redSel.value.length >= props.cfg.redCount && blueSel.value.length >= props.cfg.blueCount
})

function toggleIn(zone, n) {
  if (zone === 'red') {
    redSel.value = redSel.value.includes(n) ? redSel.value.filter((x) => x !== n) : [...redSel.value, n].sort((a, b) => a - b)
  } else {
    blueSel.value = blueSel.value.includes(n) ? blueSel.value.filter((x) => x !== n) : [...blueSel.value, n].sort((a, b) => a - b)
  }
}

function togglePos(di, v) {
  const cur = posSel.value[di] || []
  posSel.value[di] = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((a, b) => a - b)
  posSel.value = [...posSel.value]
}

function toggleTail(v) {
  tailSel.value = tailSel.value.includes(v) ? tailSel.value.filter((x) => x !== v) : [...tailSel.value, v].sort((a, b) => a - b)
}

function clearSel() {
  redSel.value = []
  blueSel.value = []
  posSel.value = []
  tailSel.value = []
}

function randomFill() {
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
  if (isDirect.value) {
    props.cfg.digits.forEach((d, di) => {
      if (!posSel.value[di] || !posSel.value[di].length) posSel.value[di] = [randInt(0, d.max)]
    })
    if (props.cfg.tail != null && !tailSel.value.length) tailSel.value = [randInt(0, props.cfg.tailMax)]
    posSel.value = [...posSel.value]
    return
  }
  const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
  const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
  const r = Math.min(props.cfg.redMax, props.cfg.redCount + randInt(1, Math.min(3, props.cfg.redMax - props.cfg.redCount)))
  const b = Math.min(props.cfg.blueMax, props.cfg.blueCount + randInt(0, 1))
  redSel.value = [...new Set([...redSel.value, ...shuffle(pool).slice(0, r)])].sort((a, b) => a - b)
  blueSel.value = [...new Set([...blueSel.value, ...shuffle(bpool).slice(0, Math.max(props.cfg.blueCount, b))])].sort((a, b) => a - b)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function currentTicket() {
  if (isDirect.value) {
    return { type: 'duplex', digits: posSel.value.map((p) => [...(p || [])]), tail: props.cfg.tail != null ? [...tailSel.value] : undefined }
  }
  return { type: 'duplex', red: [...redSel.value], blue: [...blueSel.value] }
}

function scoreLine(line) {
  if (isDirect.value) {
    const stats = computeDirectStats(props.cfg, props.draws, line)
    return stats && stats.total != null ? stats.total : 0
  }
  const r = scoreTicketPlay(props.cfg, props.draws, { type: 'single', red: line.red, blue: line.blue })
  return r.total != null ? r.total : 0
}

function doExpand() {
  if (!selectionValid.value) return
  const ticket = currentTicket()
  const calc = calcPlay(props.cfg, ticket)
  let lines = expandTicket(props.cfg, ticket)
  if (!lines.length) {
    ElMessage.warning('无法展开：请检查复式选择是否合法')
    return
  }
  // 防止组合爆炸（超过 5 万注直接阻止）
  if (lines.length > 50000) {
    ElMessage.warning(`展开注数 ${lines.length} 超出安全上限（5 万注），请减少所选号码`)
    return
  }
  expanded.value = lines
  // 逐注评分
  const t0 = performance.now()
  scored.value = lines.map((l) => {
    const sc = scoreLine(l)
    return { ...l, score: sc }
  })
  // 降序
  scored.value.sort((a, b) => b.score - a.score)
  ElMessage.success(`展开 ${lines.length} 注，评分耗时 ${Math.round(performance.now() - t0)}ms`)
}

const fullAmount = computed(() => expanded.value.length * 2)

const saveList = computed(() => {
  if (!shrinkEnabled.value) return scored.value
  const list = []
  if (shrinkMode.value === 'topN') {
    return scored.value.slice(0, Math.min(topN.value, scored.value.length))
  }
  // 按预算：单注 2 元
  const maxN = Math.floor(budget.value / 2)
  return scored.value.slice(0, Math.min(maxN, scored.value.length))
})

const shrunk = computed(() => (shrinkEnabled.value ? saveList.value : []))
const shrunkAmount = computed(() => shrunk.value.length * 2)
const savePct = computed(() => {
  if (!fullAmount.value) return 0
  return Math.round(((fullAmount.value - shrunkAmount.value) / fullAmount.value) * 100)
})

const shownLines = computed(() => saveList.value.slice(0, 100))

function saveIndex(line) {
  return saveList.value.indexOf(line) + 1
}

function doShrink() {
  ElMessage.success(`缩水完成：${expanded.value.length} → ${saveList.value.length} 注`)
}

function exportCsv() {
  if (!saveList.value.length) return
  const rows = [['序号', '红球/号码', '蓝球/尾位', '评分']]
  saveList.value.forEach((l, i) => {
    const main = l.digits != null ? l.digits.join(',') : l.red.map(pad2).join(',')
    const sub = l.tail != null ? String(l.tail) : l.blue ? l.blue.map(pad2).join(',') : ''
    rows.push([i + 1, main, sub, l.score != null ? Math.round(l.score * 100) / 100 : ''])
  })
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.cfg.key}-拆票缩水-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('CSV 已导出')
}

function saveToPicks() {
  if (!saveList.value.length) return
  const latest = props.draws && props.draws.length ? props.draws[0] : null
  const STORE_KEY = 'lottery-picker-mypicks-' + props.cfg.key
  let picks = []
  try {
    picks = JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
  } catch (e) {
    picks = []
  }
  const pick = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createStamp: Date.now(),
    ticket: { type: 'multi', tickets: saveList.value.map((l) => (l.digits != null ? { digits: l.digits, tail: l.tail != null ? l.tail : undefined } : { red: l.red, blue: l.blue })) },
    savedAt: Date.now(),
    combos: saveList.value.length,
    amount: saveList.value.length * 2,
    score: { total: Math.round(saveList.value.reduce((s, l) => s + (l.score || 0), 0) / saveList.value.length * 100) / 100, count: saveList.value.length },
    checkedIssue: latest ? latest.issue : null,
    status: latest ? 'checked' : 'pending',
    prize: latest ? checkTicketHistory(props.cfg, { type: 'multi', tickets: saveList.value.map((l) => (l.digits != null ? { digits: l.digits, tail: l.tail != null ? l.tail : undefined } : { red: l.red, blue: l.blue })) }, props.draws) : null,
    hits: latest ? checkTicketHistoryMulti(props.cfg, { type: 'multi', tickets: saveList.value.map((l) => (l.digits != null ? { digits: l.digits, tail: l.tail != null ? l.tail : undefined } : { red: l.red, blue: l.blue })) }, props.draws) : { hits: [], hitCount: 0, totalBonus: 0 },
    hitCount: 0,
    totalBonus: 0,
    _hitsExpanded: false
  }
  try {
    const multi = pick.hits
    pick.hitCount = multi ? multi.hitCount : 0
    pick.totalBonus = multi ? multi.totalBonus : 0
  } catch (e) {}
  picks.unshift(pick)
  localStorage.setItem(STORE_KEY, JSON.stringify(picks))
  ElMessage.success(`已保存 ${saveList.value.length} 注到自选号（可在「自选号」页面查看与核对）`)
}
</script>

<style scoped>
.pick-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  padding: 16px;
  margin-bottom: 14px;
}

.zone-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.red-label {
  color: var(--red);
}

.blue-label {
  color: var(--blue);
  margin-top: 14px;
}

.ball-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pool-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  font-weight: 600;
}

.btn-red.picked {
  background: radial-gradient(circle at 32% 28%, #ff9a8a, #d92b3f 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(217, 43, 63, 0.5);
}

.btn-blue.picked {
  background: radial-gradient(circle at 32% 28%, #8fc0ff, #1d5ad4 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(29, 90, 212, 0.5);
}

.pick-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.sum-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 12px 14px;
}

.sum-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.sum-value {
  font-size: 20px;
  font-weight: 800;
}

.sum-accent {
  color: var(--accent);
}

.sum-save {
  color: #67c23a;
}

.shrink-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.sub-title {
  font-size: 13px;
  font-weight: 700;
  margin: 14px 0 8px;
  color: var(--text-main);
}

.line-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 8px;
  background: var(--card-bg);
}

.line-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 6px;
}

.line-row:nth-child(odd) {
  background: var(--card-inset);
}

.line-no {
  width: 36px;
  font-size: 11px;
  flex: none;
}

.line-score {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  flex: none;
}
</style>
