<template>
  <div>
    <div class="card-title">奖池 · 销量 · 派奖追踪</div>

    <div class="toolbar">
      <el-radio-group v-model="range" size="small" @change="render">
        <el-radio-button label="30">近30期</el-radio-button>
        <el-radio-button label="50">近50期</el-radio-button>
        <el-radio-button label="100">近100期</el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>
      <span class="dim" style="font-size: 12px">数据来自官方开奖接口，奖池/销量以官方公布口径为准</span>
    </div>

    <div v-if="!hasData" class="empty-wrap">
      <el-empty description="该彩种官方接口未提供奖池/销量数据，暂无可展示统计" style="padding: 60px 0" />
    </div>

    <template v-else>
      <!-- A. 概览卡片 -->
      <div class="overview-row">
        <div class="ov-card">
          <div class="ov-label">最新一期奖池</div>
          <div v-if="latest.pool != null" class="ov-value ov-gold">¥{{ fmtMoney(latest.pool) }}</div>
          <div v-else class="ov-value dim">—</div>
          <div class="ov-detail dim">第 {{ latest.issue }} 期 · {{ fmtDate(latest.date) }}</div>
        </div>
        <div class="ov-card">
          <div class="ov-label">最新一期销量</div>
          <div v-if="latest.sales != null" class="ov-value">{{ '¥' + fmtMoney(latest.sales) }}</div>
          <div v-else class="ov-value dim">—</div>
          <div class="ov-detail dim" v-if="periodAvgSales">区间日均销量 ¥{{ fmtMoney(periodAvgSales) }}</div>
        </div>
        <div class="ov-card">
          <div class="ov-label">区间最高单期销量</div>
          <template v-if="maxSalesDraw">
            <div class="ov-value ov-blue">{{ '¥' + fmtMoney(maxSalesDraw.sales) }}</div>
            <div class="ov-detail dim">第 {{ maxSalesDraw.issue }} 期 · {{ fmtDate(maxSalesDraw.date) }}</div>
          </template>
          <div v-else class="ov-value dim">—</div>
        </div>
        <div class="ov-card">
          <div class="ov-label">区间派奖估算（一等奖）</div>
          <template v-if="periodPayout != null">
            <div class="ov-value ov-green">¥{{ fmtMoney(periodPayout) }}</div>
            <div class="ov-detail dim">{{ payoutCount }} 注一等奖 · 平均 ¥{{ fmtMoney(payoutAvg) }}</div>
          </template>
          <div v-else class="ov-value dim">—</div>
        </div>
      </div>

      <!-- B. 奖池+销量双轴图 -->
      <div class="sub-title">
        奖池走势（折线）· 销量（柱状）
        <span class="dim" style="font-size: 12px; margin-left: 8px">共 {{ filteredDraws.length }} 期</span>
      </div>
      <div ref="mainEl" style="width: 100%; height: 360px"></div>

      <!-- C. 派奖金额图（仅有一等奖数据的彩种） -->
      <template v-if="hasPayout">
        <div class="sub-title">单期一等奖派奖估算（注数 × 单注奖金）</div>
        <div ref="payoutEl" style="width: 100%; height: 300px"></div>
      </template>

      <!-- D. 明细表 -->
      <div class="sub-title">明细（近 {{ filteredDraws.length }} 期）</div>
      <el-table :data="tableRows" size="small" border height="420" style="width: 100%">
        <el-table-column prop="issue" label="期号" width="120" />
        <el-table-column label="日期" width="110">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="销量" width="150" align="right">
          <template #default="{ row }">{{ row.sales != null ? '¥' + fmtMoney(row.sales) : '—' }}</template>
        </el-table-column>
        <el-table-column label="奖池" width="160" align="right">
          <template #default="{ row }">{{ row.pool != null ? '¥' + fmtMoney(row.pool) : '—' }}</template>
        </el-table-column>
        <el-table-column label="一等奖注数" width="110" align="right">
          <template #default="{ row }">{{ row.firstPrizeCount ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="一等奖单注奖金" width="150" align="right">
          <template #default="{ row }">{{ row.firstPrizePerBet != null ? '¥' + fmtMoney(row.firstPrizePerBet) : '—' }}</template>
        </el-table-column>
        <el-table-column label="派奖估算" width="150" align="right">
          <template #default="{ row }">
            <span v-if="row.firstPrizeCount != null && row.firstPrizePerBet != null" class="payout-cell">¥{{ fmtMoney(row.firstPrizeCount * row.firstPrizePerBet) }}</span>
            <span v-else class="dim">—</span>
          </template>
        </el-table-column>
        <el-table-column label="奖池变化" width="110" align="right">
          <template #default="{ row }">
            <span v-if="row.pool != null && row.poolDelta != null" :class="row.poolDelta >= 0 ? 'delta-up' : 'delta-down'">
              {{ row.poolDelta >= 0 ? '+' : '' }}{{ fmtMoney(row.poolDelta) }}
            </span>
            <span v-else class="dim">—</span>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'
import { fmtMoney, fmtDate } from '../utils/game-config'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const range = ref('50')
const mainEl = ref(null)
const payoutEl = ref(null)
let mainChart = null
let payoutChart = null
let cancelTheme = null

const filteredDraws = computed(() => {
  if (!props.draws || !props.draws.length) return []
  const n = range.value === 'all' ? props.draws.length : Number(range.value)
  return props.draws.slice(0, n)
})

const hasData = computed(() => filteredDraws.value.some((d) => d.sales != null || d.pool != null || d.firstPrizePerBet != null))
const hasPayout = computed(() => filteredDraws.value.some((d) => d.firstPrizeCount != null && d.firstPrizePerBet != null))

const latest = computed(() => (filteredDraws.value.length ? filteredDraws.value[0] : null))

const periodAvgSales = computed(() => {
  const rows = filteredDraws.value.filter((d) => d.sales != null)
  if (!rows.length) return null
  return rows.reduce((s, d) => s + d.sales, 0) / rows.length
})

const maxSalesDraw = computed(() => {
  const rows = filteredDraws.value.filter((d) => d.sales != null)
  if (!rows.length) return null
  return rows.reduce((a, b) => (a.sales >= b.sales ? a : b))
})

const payoutRows = computed(() =>
  filteredDraws.value.filter((d) => d.firstPrizeCount != null && d.firstPrizePerBet != null)
)

const periodPayout = computed(() => {
  if (!payoutRows.value.length) return null
  return payoutRows.value.reduce((s, d) => s + d.firstPrizeCount * d.firstPrizePerBet, 0)
})

const payoutCount = computed(() => payoutRows.value.reduce((s, d) => s + d.firstPrizeCount, 0))
const payoutAvg = computed(() => {
  if (!payoutCount.value) return 0
  return periodPayout.value / payoutCount.value
})

const tableRows = computed(() => {
  const rows = filteredDraws.value.map((d) => ({ ...d }))
  rows.forEach((d, i) => {
    if (d.pool != null && i + 1 < rows.length && rows[i + 1].pool != null) {
      d.poolDelta = d.pool - rows[i + 1].pool
    } else {
      d.poolDelta = null
    }
  })
  return rows
})

function render() {
  if (!hasData.value) return
  const t = chartTheme()
  const rows = filteredDraws.value
  const issues = rows.map((d) => d.issue)
  const sales = rows.map((d) => (d.sales != null ? d.sales : null))
  const pool = rows.map((d) => (d.pool != null ? d.pool : null))
  const hasPool = pool.some((v) => v != null)
  const hasSales = sales.some((v) => v != null)

  const series = []
  if (hasSales) {
    series.push({
      name: '销量',
      type: 'bar',
      data: sales,
      barMaxWidth: 14,
      itemStyle: { color: t.blueSoft, borderColor: t.blue, borderWidth: 1, borderRadius: [3, 3, 0, 0] },
      yAxisIndex: 0,
      tooltip: {
        valueFormatter: (v) => (v == null ? '—' : '¥' + fmtMoney(v))
      }
    })
  }
  if (hasPool) {
    series.push({
      name: '奖池',
      type: 'line',
      data: pool,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2.5, color: t.gold },
      itemStyle: { color: t.gold },
      yAxisIndex: 1,
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: t.goldSoft },
            { offset: 1, color: 'rgba(0,0,0,0)' }
          ]
        }
      },
      tooltip: {
        valueFormatter: (v) => (v == null ? '—' : '¥' + fmtMoney(v))
      }
    })
  }

  if (!mainChart && mainEl.value) mainChart = echarts.init(mainEl.value)
  if (!mainChart) return
  mainChart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      ...tipStyle(t)
    },
    legend: {
      data: series.map((s) => s.name),
      textStyle: { color: t.text, fontSize: 12 },
      top: 0
    },
    grid: { left: 70, right: hasPool ? 84 : 24, top: 34, bottom: 30 },
    xAxis: {
      type: 'category',
      data: issues,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.text, fontSize: 11 },
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: hasSales ? '销量' : '',
        nameTextStyle: { color: t.text, fontSize: 11 },
        axisLabel: {
          color: t.text,
          fontSize: 11,
          formatter: (v) => compactMoney(v)
        },
        splitLine: { lineStyle: { color: t.split } }
      },
      ...(hasPool
        ? [
            {
              type: 'value',
              name: '奖池',
              nameTextStyle: { color: t.text, fontSize: 11 },
              axisLabel: {
                color: t.text,
                fontSize: 11,
                formatter: (v) => compactMoney(v)
              },
              splitLine: { show: false }
            }
          ]
        : [])
    ],
    series,
    dataZoom: rows.length > 60 ? [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 4 }] : []
  })
  mainChart.resize()

  renderPayout(t)
}

function renderPayout(t) {
  if (!hasPayout.value) return
  const rows = payoutRows.value
  if (!payoutChart && payoutEl.value) payoutChart = echarts.init(payoutEl.value)
  if (!payoutChart) return
  payoutChart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      ...tipStyle(t),
      valueFormatter: (v) => '¥' + fmtMoney(v)
    },
    grid: { left: 80, right: 24, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: rows.map((d) => d.issue),
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.text, fontSize: 11 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: t.text,
        fontSize: 11,
        formatter: (v) => compactMoney(v)
      },
      splitLine: { lineStyle: { color: t.split } }
    },
    series: [
      {
        name: '派奖估算',
        type: 'bar',
        data: rows.map((d) => d.firstPrizeCount * d.firstPrizePerBet),
        barMaxWidth: 16,
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: t.red },
              { offset: 1, color: t.redDeep }
            ]
          },
          borderRadius: [3, 3, 0, 0]
        }
      }
    ],
    dataZoom: rows.length > 60 ? [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 4 }] : []
  })
  payoutChart.resize()
}

function compactMoney(v) {
  if (v == null) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
  return String(v)
}

onMounted(async () => {
  await nextTick()
  render()
  cancelTheme = onThemeChange(() => {
    const t = chartTheme()
    if (mainChart) {
      mainChart.dispose()
      mainChart = null
    }
    if (payoutChart) {
      payoutChart.dispose()
      payoutChart = null
    }
    if (mainEl.value || payoutEl.value) render()
  })
  window.addEventListener('resize', onResize)
})

function onResize() {
  if (mainChart) mainChart.resize()
  if (payoutChart) payoutChart.resize()
}

onBeforeUnmount(() => {
  if (cancelTheme) cancelTheme()
  window.removeEventListener('resize', onResize)
  if (mainChart) {
    mainChart.dispose()
    mainChart = null
  }
  if (payoutChart) {
    payoutChart.dispose()
    payoutChart = null
  }
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.overview-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.ov-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 14px 16px;
}

.ov-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.ov-value {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  word-break: break-all;
}

.ov-gold {
  color: var(--accent);
}

.ov-blue {
  color: var(--blue);
}

.ov-green {
  color: #67c23a;
}

.ov-detail {
  font-size: 12px;
  margin-top: 4px;
}

.sub-title {
  font-size: 13px;
  font-weight: 700;
  margin: 14px 0 8px;
  color: var(--text-main);
}

.empty-wrap {
  padding: 30px 0;
}

.payout-cell {
  color: var(--accent);
  font-weight: 600;
}

.delta-up {
  color: #f56c6c;
}

.delta-down {
  color: #67c23a;
}
</style>
