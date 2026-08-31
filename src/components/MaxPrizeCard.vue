<template>
  <div>
    <div class="card-title">各省最大奖项出现次数（近 {{ filteredDraws.length }} 期一等奖）</div>

    <!-- 工具条：期数筛选 + 维度切换 -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px">
      <el-radio-group v-model="range" size="small" @change="render">
        <el-radio-button label="30">近30期</el-radio-button>
        <el-radio-button label="50">近50期</el-radio-button>
        <el-radio-button label="100">近100期</el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>
      <el-radio-group v-model="dim" size="small" @change="render">
        <el-radio-button label="occurrences">出现期数</el-radio-button>
        <el-radio-button label="count">累计注数</el-radio-button>
        <el-radio-button label="maxAmount">最高单注奖金</el-radio-button>
      </el-radio-group>
    </div>

    <!-- A. 概览卡片 -->
    <div class="overview-row">
      <div class="prize-card prize-card-main">
        <div class="prize-label">近 {{ filteredDraws.length }} 期单注最高奖金</div>
        <template v-if="maxPerBet">
          <div class="prize-value">{{ '¥' + fmtMoney(maxPerBet.firstPrizePerBet) }}</div>
          <div class="prize-detail">
            期号 {{ maxPerBet.issue }} · {{ fmtDate(maxPerBet.date) }} · 一等奖 {{ maxPerBet.firstPrizeCount ?? '—' }} 注
          </div>
          <div class="prize-balls">
            <span v-for="n in maxPerBet.red" :key="'r' + n" class="ball ball-red ball-sm">{{ pad2(n) }}</span>
            <span v-for="(b, i) in blueList(maxPerBet)" :key="'b' + i" class="ball ball-blue ball-sm">{{ pad2(b) }}</span>
          </div>
        </template>
        <div v-else class="prize-value dim">—</div>
      </div>
      <div class="prize-card">
        <div class="prize-label">近 {{ filteredDraws.length }} 期单期一等奖注数之最</div>
        <template v-if="maxCountDraw">
          <div class="prize-value prize-value-gold">{{ maxCountDraw.firstPrizeCount ?? '—' }} <span class="prize-value-unit">注</span></div>
          <div class="prize-detail">
            期号 {{ maxCountDraw.issue }} · {{ fmtDate(maxCountDraw.date) }} · 单注 ¥{{ fmtMoney(maxCountDraw.firstPrizePerBet) }}
          </div>
          <div class="prize-detail" v-if="maxCountDraw.winners && maxCountDraw.winners.length">
            中奖省市：{{ winnersText(maxCountDraw.winners) }}
          </div>
          <div v-else class="prize-detail dim">官方接口未提供中奖省市</div>
        </template>
        <div v-else class="prize-value dim">—</div>
      </div>
    </div>

    <!-- E. Top 省份榜 -->
    <div v-if="topProvinces.length" class="top-row">
      <div
        v-for="(p, idx) in topProvinces"
        :key="p.province"
        class="top-chip"
        :class="'top-rank-' + (idx + 1)"
        @click="view = 'map'; render()"
      >
        <span class="top-badge">{{ idx + 1 }}</span>
        <span class="top-name">{{ p.province }}</span>
        <span class="top-stat">{{ p.occurrences }}期 · {{ p.count }}注</span>
      </div>
    </div>

    <!-- D. 地图 / 条形图 -->
    <div class="sub-title">
      统计视图
      <el-radio-group v-model="view" size="small" @change="render">
        <el-radio-button label="map">地图视图</el-radio-button>
        <el-radio-button label="bar">条形图视图</el-radio-button>
      </el-radio-group>
    </div>
    <div v-if="hasData">
      <div v-show="view === 'map'" ref="mapEl" style="width: 100%; height: 500px"></div>
      <div v-show="view === 'bar'" ref="barEl" style="width: 100%; height: 500px"></div>
    </div>
    <el-empty v-else description="该彩种官方接口未提供中奖省份分布数据，暂无统计可展示" style="padding: 60px 0" />
    <div style="margin-top: 8px; display: flex; justify-content: space-between" class="dim">
      <span>覆盖省份：{{ provinces.length }} 个 · 一等奖记录：{{ totalWinners }} 条</span>
      <span>未收录中奖地址的期数：{{ missingCount }} 期</span>
    </div>

    <!-- B. 一等奖奖金走势 -->
    <div class="card-title" style="margin-top: 24px">一等奖奖金走势（近 {{ filteredDraws.length }} 期）</div>
    <div ref="trendEl" style="width: 100%; height: 300px"></div>

    <!-- C. 每期最大奖明细 -->
    <div class="card-title" style="margin-top: 24px">每期最大奖明细（近 {{ filteredDraws.length }} 期）</div>
    <el-table :data="detailRows" size="small" max-height="420" style="width: 100%">
      <el-table-column prop="issue" label="期号" width="110" sortable />
      <el-table-column prop="date" label="开奖日期" width="116" />
      <el-table-column label="单注奖金" width="150" sortable :sort-by="(row) => row.amount || 0">
        <template #default="{ row }">{{ row.amount ? '¥' + fmtMoney(row.amount) : '—' }}</template>
      </el-table-column>
      <el-table-column label="一等奖注数" width="108" sortable :sort-by="(row) => (typeof row.count === 'number' ? row.count : -1)">
        <template #default="{ row }">{{ row.count }}</template>
      </el-table-column>
      <el-table-column label="中奖省市" min-width="240">
        <template #default="{ row }">
          <span v-if="row.winners.length">{{ winnersText(row.winners) }}</span>
          <span v-else class="dim">官方接口未提供</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'
import { getProvinceCoord } from '../utils/map-data'
import { fmtDate, fmtMoney, pad2 } from '../utils/game-config'
import chinaJson from '../assets/china.json'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const view = ref('map')
const dim = ref('occurrences')
const range = ref('100')
const mapEl = ref(null)
const barEl = ref(null)
const trendEl = ref(null)
let mapChart = null
let barChart = null
let trendChart = null
let mapRegistered = false
let offTheme = null

/** F. 期数范围筛选（draws 最新在前） */
const filteredDraws = computed(() => {
  const list = props.draws || []
  if (range.value === 'all' || !list.length) return list
  const n = parseInt(range.value, 10)
  return list.slice(0, n)
})

/**
 * 各省最大奖项（一等奖）统计：
 * occurrences = 该省在多少期内出现一等奖（每期最多计 1 次）
 * count       = 该省累计一等奖注数
 * maxAmount   = 该省历史最高单注奖金
 */
const provStats = computed(() => {
  const map = new Map()
  filteredDraws.value.forEach((d) => {
    const ws = d.winners || []
    if (!ws.length) return
    const amount = d.firstPrizePerBet || 0
    const seen = new Set()
    ws.forEach((w) => {
      const p = w.province
      if (!p) return
      if (!map.has(p)) map.set(p, { province: p, coords: getProvinceCoord(p), occurrences: 0, count: 0, maxAmount: 0, draws: [] })
      const item = map.get(p)
      item.count++
      if (amount > item.maxAmount) item.maxAmount = amount
      if (!seen.has(p)) {
        seen.add(p)
        item.occurrences++
      }
      if (item.draws.length < 12 && !item.draws.find((x) => x.issue === d.issue)) {
        item.draws.push({ issue: d.issue, date: d.date, amount, note: w.siteNo || '' })
      }
    })
  })
  return [...map.values()].filter((x) => x.coords)
})

/** A. 概览：单注最高奖金 */
const maxPerBet = computed(() => {
  let best = null
  filteredDraws.value.forEach((d) => {
    if (d.firstPrizePerBet && (!best || d.firstPrizePerBet > best.firstPrizePerBet)) best = d
  })
  return best
})

/** A. 概览：单期一等奖注数之最 */
const maxCountDraw = computed(() => {
  let best = null
  filteredDraws.value.forEach((d) => {
    const c = d.firstPrizeCount
    if (typeof c === 'number' && (!best || c > best.firstPrizeCount)) best = d
  })
  return best
})

/** E. Top 5 省份 */
const topProvinces = computed(() => [...provStats.value].sort((a, b) => b.occurrences - a.occurrences || b.count - a.count).slice(0, 5))

const provinces = computed(() => provStats.value)
const totalWinners = computed(() => filteredDraws.value.reduce((acc, d) => acc + ((d.winners || []).length || 0), 0))
const missingCount = computed(() => filteredDraws.value.filter((d) => !d.winners || d.winners.length === 0).length)
const hasData = computed(() => totalWinners.value > 0)

/** C. 明细表行 */
const detailRows = computed(() => {
  return filteredDraws.value.map((d) => ({
    issue: d.issue,
    date: fmtDate(d.date),
    amount: d.firstPrizePerBet,
    count: typeof d.firstPrizeCount === 'number' ? d.firstPrizeCount : '—',
    winners: d.winners || []
  }))
})

/** D. 当前维度取值 */
function dimValue(p) {
  if (dim.value === 'count') return p.count
  if (dim.value === 'maxAmount') return p.maxAmount
  return p.occurrences
}

const DIM_LABEL = { occurrences: '出现期数', count: '累计注数', maxAmount: '最高单注奖金' }

function winnersText(winners) {
  const map = new Map()
  winners.forEach((w) => {
    if (!w.province) return
    map.set(w.province, (map.get(w.province) || 0) + 1)
  })
  return [...map.entries()].map(([p, c]) => `${p}${c > 1 ? c + '注' : ''}`).join('、')
}

function blueList(row) {
  const list = [row.blue]
  if (row.blue2 != null) list.push(row.blue2)
  return list.filter((b) => b != null)
}

function tooltipHtml(p) {
  let html = `<b>${p.province}</b> · 出现 ${p.occurrences} 期 · 一等奖共 ${p.count} 注 · 最高单注 ¥${fmtMoney(p.maxAmount)}`
  p.draws.slice(0, 10).forEach((d) => {
    html += `<br/>${d.issue} · ${fmtDate(d.date)} · ¥${fmtMoney(d.amount)}${d.note ? ' · ' + d.note : ''}`
  })
  if (p.draws.length > 10) html += `<br/>… 共 ${p.draws.length} 期`
  return html
}

function renderMap() {
  if (!mapEl.value || !hasData.value) return
  const t = chartTheme()
  if (!mapChart) mapChart = echarts.init(mapEl.value)
  if (!mapRegistered) {
    echarts.registerMap('china', chinaJson)
    mapRegistered = true
  }
  const detail = provStats.value.reduce((m, p) => {
    m[p.province] = p
    return m
  }, {})
  const values = provStats.value.map((p) => dimValue(p))
  const maxVal = Math.max(1, ...values)
  mapChart.setOption(
    {
      animationDuration: 600,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'item',
        ...tipStyle(t),
        formatter: (params) => {
          if (params.seriesType === 'effectScatter') return tooltipHtml(detail[params.name] || params)
          const p = detail[params.name]
          return `${params.name}<br/>${DIM_LABEL[dim.value]}：${p ? (dim.value === 'maxAmount' ? '¥' + fmtMoney(p.maxAmount) : dimValue(p)) : '—'}`
        }
      },
      visualMap: {
        min: 0,
        max: maxVal,
        left: 20,
        bottom: 20,
        calculable: true,
        inRange: { color: t.light ? ['#dfe6f4', '#ffd08a', '#e88f1f'] : ['#1a2340', '#8a5cff', '#ffb03a'] },
        textStyle: { color: t.text }
      },
      geo: {
        map: 'china',
        roam: true,
        scaleLimit: { min: 0.8, max: 8 },
        zoom: 1.1,
        itemStyle: {
          areaColor: t.light ? '#e8edf7' : '#1c2540',
          borderColor: t.light ? 'rgba(20,30,60,0.18)' : 'rgba(255,255,255,0.22)',
          borderWidth: 0.8
        },
        emphasis: {
          itemStyle: { areaColor: t.light ? '#d7e0f2' : '#2a3860' },
          label: { show: false }
        },
        label: { show: false }
      },
      series: [
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: provStats.value.map((p) => ({
            name: p.province,
            value: p.coords.concat(dimValue(p))
          })),
          symbolSize: (val) => {
            const v = val[2] || 1
            const r = v / maxVal
            return 8 + Math.sqrt(r) * 14
          },
          rippleEffect: { brushType: 'stroke', scale: 3 },
          itemStyle: {
            color: {
              type: 'radial',
              x: 0.3,
              y: 0.3,
              r: 1,
              colorStops: [
                { offset: 0, color: '#ffd9a8' },
                { offset: 1, color: '#ff8c1a' }
              ]
            },
            shadowBlur: 10,
            shadowColor: 'rgba(255,140,26,0.6)'
          },
          zlevel: 2
        }
      ]
    },
    true
  )
}

function renderBar() {
  if (!barEl.value || !hasData.value) return
  const t = chartTheme()
  if (!barChart) barChart = echarts.init(barEl.value)
  const sorted = [...provStats.value].sort((a, b) => dimValue(b) - dimValue(a) || b.count - a.count)
  const names = sorted.map((p) => p.province)
  const values = sorted.map((p) => dimValue(p))
  const detail = sorted.reduce((m, p) => {
    m[p.province] = p
    return m
  }, {})
  barChart.setOption(
    {
      animationDuration: 600,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...tipStyle(t),
        formatter: (params) => {
          const p = params[0]
          if (!p) return ''
          return tooltipHtml(detail[p.name])
        }
      },
      grid: { left: 64, right: 72, top: 30, bottom: 30 },
      xAxis: {
        type: 'value',
        name: DIM_LABEL[dim.value],
        nameTextStyle: { color: t.text, fontSize: 11 },
        minInterval: dim.value === 'maxAmount' ? undefined : 1,
        splitLine: { lineStyle: { color: t.split } },
        axisLabel: {
          color: t.text,
          fontSize: 11,
          formatter: (v) => (dim.value === 'maxAmount' ? fmtMoney(v) : v)
        }
      },
      yAxis: {
        type: 'category',
        data: names,
        inverse: true,
        axisLabel: { color: t.text, fontSize: 12 },
        axisLine: { lineStyle: { color: t.axisLine } }
      },
      series: [
        {
          name: DIM_LABEL[dim.value],
          type: 'bar',
          data: values,
          barMaxWidth: 22,
          itemStyle: {
            borderRadius: [0, 8, 8, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: '#ffb35c' },
                { offset: 1, color: '#e88f1f' }
              ]
            }
          },
          label: {
            show: true,
            position: 'right',
            color: t.gold,
            fontSize: 12,
            formatter: (p) => (dim.value === 'maxAmount' ? '¥' + fmtMoney(p.value) : p.value)
          }
        }
      ]
    },
    true
  )
}

/** B. 一等奖奖金走势 */
function renderTrend() {
  if (!trendEl.value) return
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  const t = chartTheme()
  const rows = [...filteredDraws.value].reverse()
  const issues = rows.map((d) => d.issue)
  const perBet = rows.map((d) => d.firstPrizePerBet || null)
  const counts = rows.map((d) => (typeof d.firstPrizeCount === 'number' ? d.firstPrizeCount : null))
  trendChart.setOption(
    {
      animationDuration: 600,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: t.axisLine } },
        ...tipStyle(t),
        formatter: (params) => {
          const i = params[0].dataIndex
          const d = rows[i]
          return `${d.issue} · ${fmtDate(d.date)}<br/>单注奖金：¥${fmtMoney(d.firstPrizePerBet)}<br/>一等奖注数：${typeof d.firstPrizeCount === 'number' ? d.firstPrizeCount : '—'} 注`
        }
      },
      legend: { top: 0, textStyle: { fontSize: 12, color: t.text } },
      grid: { left: 68, right: 56, top: 36, bottom: 64 },
      xAxis: {
        type: 'category',
        data: issues,
        axisLabel: { fontSize: 10, interval: 9, color: t.text },
        axisLine: { lineStyle: { color: t.axisLine } },
        axisTick: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          name: '单注奖金',
          nameTextStyle: { color: t.text, fontSize: 11 },
          axisLabel: { color: t.text, fontSize: 11, formatter: (v) => fmtMoney(v) },
          splitLine: { lineStyle: { type: 'dashed', color: t.split } }
        },
        {
          type: 'value',
          name: '注数',
          nameTextStyle: { color: t.text, fontSize: 11 },
          axisLabel: { color: t.text, fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '单注奖金',
          type: 'line',
          smooth: true,
          symbolSize: 5,
          data: perBet,
          lineStyle: { color: t.red, width: 2 },
          itemStyle: { color: t.red },
          connectNulls: true,
          markLine: {
            symbol: 'none',
            data: [{ yAxis: maxPerBet.value ? maxPerBet.value.firstPrizePerBet : 0 }],
            lineStyle: { type: 'dashed', color: t.gold },
            label: { formatter: '区间最高', color: t.gold, fontSize: 11 }
          }
        },
        {
          name: '一等奖注数',
          type: 'bar',
          yAxisIndex: 1,
          data: counts,
          barMaxWidth: 9,
          itemStyle: { color: t.blueSoft, borderRadius: [2, 2, 0, 0] }
        }
      ]
    },
    true
  )
}

function render() {
  if (view.value === 'map') renderMap()
  else renderBar()
  renderTrend()
}

function onResize() {
  if (mapChart) mapChart.resize()
  if (barChart) barChart.resize()
  if (trendChart) trendChart.resize()
}

watch(() => props.draws, render)
watch(view, () => {
  // 切换视图时确保目标容器尺寸已就绪
  setTimeout(render, 30)
})
watch(dim, () => {
  setTimeout(render, 30)
})
onMounted(() => {
  render()
  window.addEventListener('resize', onResize)
  offTheme = onThemeChange(render)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (offTheme) offTheme()
  if (mapChart) {
    mapChart.dispose()
    mapChart = null
  }
  if (barChart) {
    barChart.dispose()
    barChart = null
  }
  if (trendChart) {
    trendChart.dispose()
    trendChart = null
  }
})
</script>

<style scoped>
.overview-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.prize-card {
  flex: 1;
  min-width: 300px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 16px 20px;
  background: var(--surface-2);
  transition: transform var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}

.prize-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
}

.prize-card-main {
  background: linear-gradient(135deg, var(--red-soft, rgba(255, 77, 94, 0.12)), var(--surface-2) 65%);
}

.prize-label {
  font-size: var(--fs-13);
  color: var(--text-muted);
  margin-bottom: 6px;
}

.prize-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--red);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}

.prize-value-gold {
  color: var(--gold, #e8a020);
}

.prize-value-unit {
  font-size: 16px;
  font-weight: 600;
}

.prize-value.dim {
  font-size: 28px;
  color: var(--text-muted) !important;
}

.prize-detail {
  font-size: var(--fs-12);
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.prize-balls {
  margin-top: 4px;
}

.top-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.top-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  transition: transform var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}

.top-chip:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
}

.top-rank-1 {
  border-color: var(--gold, #e8a020);
  background: linear-gradient(135deg, rgba(232, 160, 32, 0.16), var(--surface-2) 70%);
}

.top-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: var(--text-muted);
}

.top-rank-1 .top-badge {
  background: var(--gold, #e8a020);
}

.top-rank-2 .top-badge {
  background: #9aa4b5;
}

.top-rank-3 .top-badge {
  background: #c98a4b;
}

.top-name {
  font-size: var(--fs-14);
  font-weight: 700;
  color: var(--text);
}

.top-stat {
  font-size: var(--fs-12);
  color: var(--text-secondary);
}

.sub-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--fs-14);
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}
</style>
