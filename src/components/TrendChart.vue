<template>
  <div class="trend-wrap">
    <div class="trend-toolbar">
      <div class="card-title">号码走势图（彩票店样式）</div>
      <div class="trend-controls">
        <span class="dim">显示期数</span>
        <el-radio-group v-model="showCount" size="small">
          <el-radio-button value="30">30期</el-radio-button>
          <el-radio-button value="50">50期</el-radio-button>
          <el-radio-button value="100">100期</el-radio-button>
        </el-radio-group>
        <span class="dim">缩放</span>
        <el-radio-group v-model="cellSize" size="small">
          <el-radio-button value="sm">小</el-radio-button>
          <el-radio-button value="md">中</el-radio-button>
          <el-radio-button value="lg">大</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="order = order === 'desc' ? 'asc' : 'desc'">
          {{ order === 'desc' ? '最新在上' : '最新在下' }}
        </el-button>
      </div>
    </div>

    <div class="trend-legend">
      <span><i class="legend-dot legend-hit"></i>开出号码</span>
      <span><i class="legend-dot legend-miss"></i>遗漏期数</span>
      <span><i class="legend-dot legend-cold"></i>遗漏≥10（冷号）</span>
    </div>

    <div class="trend-scroll" :class="'cell-' + cellSize">
      <table class="trend-table" v-if="cfg.direct">
        <thead>
          <tr>
            <th class="col-issue">期号</th>
            <th
              v-for="(p, pi) in cfg.digits"
              :key="'ph' + pi"
              class="col-num col-red-head direct-head"
            >{{ p.label }}</th>
            <th v-if="cfg.tail" class="col-divider" :style="{ width: tailColWidth, minWidth: tailColWidth }">尾位</th>
          </tr>
          <tr>
            <th class="col-issue"></th>
            <th v-for="(p, pi) in cfg.digits" :key="'pd' + pi" class="col-num col-red-head direct-head">
              <span v-for="n in 10" :key="'pdv' + n" class="digit-head">{{ n - 1 }}</span>
            </th>
            <th v-if="cfg.tail" class="col-divider" :style="{ width: tailColWidth, minWidth: tailColWidth }">
              <span v-for="n in tailCount" :key="'tdv' + n" class="digit-head" :style="{ width: (100 / tailCount) + '%' }">{{ n - 1 }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.issue" :class="{ 'row-latest': row.isLatest }">
            <td class="col-issue">
              <div class="issue-text">{{ row.issue }}</div>
              <div class="issue-date">{{ fmtDate(row.date) }}</div>
            </td>
            <td v-for="(p, pi) in cfg.digits" :key="'pc' + pi" class="col-num digit-td">
              <span v-for="n in 10" :key="'pv' + n" class="digit-cell">
                <span v-if="row.digitMiss[pi][n - 1] === 0" class="cell-ball ball-red">{{ n - 1 }}</span>
                <span v-else-if="row.digitMiss[pi][n - 1] > 0" class="cell-miss" :class="{ 'miss-cold': row.digitMiss[pi][n - 1] >= 10 }">{{ row.digitMiss[pi][n - 1] }}</span>
                <span v-else class="cell-void"></span>
              </span>
            </td>
            <td v-if="cfg.tail" class="col-divider digit-td" :style="{ width: tailColWidth, minWidth: tailColWidth }">
              <span v-for="n in tailCount" :key="'tv' + n" class="digit-cell" :style="{ width: (100 / tailCount) + '%' }">
                <span v-if="row.tailMiss[n - 1] === 0" class="cell-ball ball-blue">{{ n - 1 }}</span>
                <span v-else-if="row.tailMiss[n - 1] > 0" class="cell-miss" :class="{ 'miss-cold': row.tailMiss[n - 1] >= 10 }">{{ row.tailMiss[n - 1] }}</span>
                <span v-else class="cell-void"></span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <table class="trend-table" v-else>
        <thead>
          <tr>
            <th class="col-issue">期号</th>
            <th
              v-for="n in cfg.redMax"
              :key="'rh' + n"
              class="col-num col-red-head"
              :class="{ 'zone-gap': n === cfg.zoneEdges[0] || n === cfg.zoneEdges[1] }"
            >{{ pad2(n) }}</th>
            <th class="col-divider">后区</th>
            <th v-for="n in cfg.blueMax" :key="'bh' + n" class="col-num col-blue-head">{{ pad2(n) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.issue" :class="{ 'row-latest': row.isLatest }">
            <td class="col-issue">
              <div class="issue-text">{{ row.issue }}</div>
              <div class="issue-date">{{ fmtDate(row.date) }}</div>
            </td>
            <td
              v-for="n in cfg.redMax"
              :key="'rc' + n"
              class="col-num"
              :class="{ 'zone-gap': n === cfg.zoneEdges[0] || n === cfg.zoneEdges[1] }"
            >
              <span v-if="row.redMiss[n] === 0" class="cell-ball ball-red">{{ pad2(n) }}</span>
              <span v-else-if="row.redMiss[n] > 0" class="cell-miss" :class="{ 'miss-cold': row.redMiss[n] >= 10 }">{{ row.redMiss[n] }}</span>
              <span v-else class="cell-void"></span>
            </td>
            <td class="col-divider"></td>
            <td
              v-for="n in cfg.blueMax"
              :key="'bc' + n"
              class="col-num"
            >
              <span v-if="row.blueMiss[n] === 0" class="cell-ball ball-blue">{{ pad2(n) }}</span>
              <span v-else-if="row.blueMiss[n] > 0" class="cell-miss" :class="{ 'miss-cold': row.blueMiss[n] >= 10 }">{{ row.blueMiss[n] }}</span>
              <span v-else class="cell-void"></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { pad2, fmtDate } from '../utils/game-config'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const showCount = ref('30')
const cellSize = ref('md')
const order = ref('desc') // desc = 最新在上
const tailCount = computed(() => (props.cfg.tail ? (props.cfg.tailMax ?? 9) + 1 : 0))
// 直位尾位列宽 = 每格宽 * 尾位数（7星彩 0-14 共15格，需明显放宽；!important 以覆盖 .col-divider 固定宽）
const tailColWidth = computed(() => {
  const per = cellSize.value === 'sm' ? 40 : cellSize.value === 'lg' ? 64 : 52
  return (per * tailCount.value) + 'px !important'
})

function blueList(d) {
  const list = [d.blue]
  if (d.blue2 != null) list.push(d.blue2)
  return list.filter((b) => b != null)
}

const rows = computed(() => {
  const count = Number(showCount.value)
  const slice = props.draws.slice(0, count)
  // draws[0] 视为最新一期
  if (props.cfg.direct) {
    const posCount = props.cfg.digits.length
    const lastSeenDigit = Array.from({ length: posCount }, () => Array(10).fill(-1))
    const lastSeenTail = Array(tailCount.value).fill(-1)
    const computed = slice.map((d, i) => {
      const digits = d.digits || []
      const digitMiss = Array.from({ length: posCount }, () => Array(10).fill(-1))
      const tailMiss = Array(tailCount.value).fill(-1)
      for (let p = 0; p < posCount; p++) {
        for (let v = 0; v < 10; v++) {
          if (digits[p] === v) {
            digitMiss[p][v] = 0
            lastSeenDigit[p][v] = i
          } else {
            digitMiss[p][v] = lastSeenDigit[p][v] === -1 ? -1 : i - lastSeenDigit[p][v]
          }
        }
      }
      if (props.cfg.tail) {
        for (let v = 0; v < tailCount.value; v++) {
          if (d.tail === v) {
            tailMiss[v] = 0
            lastSeenTail[v] = i
          } else {
            tailMiss[v] = lastSeenTail[v] === -1 ? -1 : i - lastSeenTail[v]
          }
        }
      }
      return { issue: d.issue, date: d.date, digitMiss, tailMiss, isLatest: i === 0 }
    })
    if (order.value === 'asc') computed.reverse()
    return computed
  }
  const lastSeenRed = Array(props.cfg.redMax + 1).fill(-1)
  const lastSeenBlue = Array(props.cfg.blueMax + 1).fill(-1)
  const computed = slice.map((d, i) => {
    const redSet = new Set(d.red || [])
    const blueSet = new Set(blueList(d))
    // 遗漏数组化（索引即号码，避免对象键查找）
    const redMiss = Array(props.cfg.redMax + 1).fill(-1)
    const blueMiss = Array(props.cfg.blueMax + 1).fill(-1)
    for (let n = 1; n <= props.cfg.redMax; n++) {
      if (redSet.has(n)) {
        redMiss[n] = 0
        lastSeenRed[n] = i
      } else {
        redMiss[n] = lastSeenRed[n] === -1 ? -1 : i - lastSeenRed[n]
      }
    }
    for (let n = 1; n <= props.cfg.blueMax; n++) {
      if (blueSet.has(n)) {
        blueMiss[n] = 0
        lastSeenBlue[n] = i
      } else {
        blueMiss[n] = lastSeenBlue[n] === -1 ? -1 : i - lastSeenBlue[n]
      }
    }
    return { issue: d.issue, date: d.date, redMiss, blueMiss, isLatest: i === 0 }
  })
  if (order.value === 'asc') computed.reverse()
  return computed
})
</script>

<style scoped>
.trend-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.trend-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.trend-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.trend-legend {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: var(--fs-12);
  color: var(--text-secondary);
}

.legend-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: -1px;
}

.legend-hit {
  background: radial-gradient(circle at 30% 30%, #ff8a80, var(--red-deep) 70%);
}

.legend-miss {
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.legend-cold {
  background: var(--blue);
}

.trend-scroll {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-1);
}

.trend-table {
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  min-width: max-content;
}

.trend-table th,
.trend-table td {
  text-align: center;
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0;
  overflow: hidden;
}

.cell-sm .trend-table th,
.cell-sm .trend-table td {
  width: 32px;
  height: 32px;
  font-size: 10px;
}

.cell-md .trend-table th,
.cell-md .trend-table td {
  width: 38px;
  height: 38px;
  font-size: 12px;
}

.cell-lg .trend-table th,
.cell-lg .trend-table td {
  width: 46px;
  height: 46px;
  font-size: 14px;
}

/* 修复：表头 sticky 层级（原 .thead .col-issue 选择器永不匹配导致错位） */
.trend-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  font-weight: 600;
  background: var(--surface-2);
  color: var(--text-primary);
}

.trend-table thead th.col-issue {
  z-index: 7;
}

.trend-table tbody td.col-issue {
  z-index: 4;
  background: var(--surface-2);
}

.col-issue {
  position: sticky;
  left: 0;
  min-width: 96px;
  width: 96px !important;
  color: var(--text-primary);
}

.issue-text {
  font-weight: 700;
  font-size: 0.92em;
}

.issue-date {
  font-size: 0.72em;
  color: var(--text-muted);
}

.row-latest td {
  background: var(--accent-soft);
}

.row-latest td.col-issue {
  background: var(--surface-2);
}

.col-red-head {
  background: linear-gradient(180deg, var(--red-soft, rgba(255, 77, 94, 0.22)), rgba(255, 77, 94, 0.08)) !important;
  color: var(--red-light, #ffb3b3) !important;
}

.col-blue-head {
  background: linear-gradient(180deg, rgba(61, 123, 255, 0.24), rgba(61, 123, 255, 0.08)) !important;
  color: var(--blue-light, #b3d4ff) !important;
}

.col-divider {
  width: 58px !important;
  min-width: 58px;
  background: var(--surface-3);
  color: var(--text-muted);
  font-size: 0.85em;
  font-weight: 600;
}

.zone-gap {
  border-right: 1px solid var(--border-strong) !important;
}

.cell-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  animation: cell-pop var(--dur-slow) var(--ease-out) both;
}

@keyframes cell-pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.cell-sm .cell-ball {
  width: 24px;
  height: 24px;
  font-size: 10px;
}

.cell-md .cell-ball {
  width: 28px;
  height: 28px;
  font-size: 11px;
}

.cell-lg .cell-ball {
  width: 34px;
  height: 34px;
  font-size: 13px;
}

.cell-miss {
  color: var(--text-muted);
  font-size: 0.85em;
}

.miss-cold {
  color: var(--blue-light, #64b5f6);
  font-weight: 700;
}

.cell-void {
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border-strong);
  opacity: 0.5;
}

/* 直位数字型：每列 10 个 0-9 子格（放大格子，避免看不清） */
.cell-sm .trend-table td.digit-td,
.cell-sm .trend-table th.direct-head { width: 400px; }
.cell-md .trend-table td.digit-td,
.cell-md .trend-table th.direct-head { width: 520px; }
.cell-lg .trend-table td.digit-td,
.cell-lg .trend-table th.direct-head { width: 640px; }

.digit-head,
.digit-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10%;
  height: 100%;
  box-sizing: border-box;
  border-left: 1px solid var(--border-subtle);
}

.digit-head:first-child,
.digit-cell:first-child {
  border-left: none;
}

.digit-head {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-muted);
}

/* 直位数字球与遗漏值放大 */
.cell-sm .digit-td .cell-ball {
  width: 30px;
  height: 30px;
  font-size: 13px;
}

.cell-md .digit-td .cell-ball {
  width: 36px;
  height: 36px;
  font-size: 15px;
}

.cell-lg .digit-td .cell-ball {
  width: 44px;
  height: 44px;
  font-size: 18px;
}

.cell-sm .digit-td .cell-miss {
  font-size: 12px;
}

.cell-md .digit-td .cell-miss {
  font-size: 14px;
}

.cell-lg .digit-td .cell-miss {
  font-size: 17px;
}
</style>
