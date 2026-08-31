<template>
  <div>
    <div class="card-title">号码分布图（近 {{ draws.length }} 期）</div>
    <el-radio-group v-model="chartType" style="margin-bottom: 12px">
      <el-radio-button value="freq">出现频次</el-radio-button>
      <el-radio-button value="miss">当前遗漏</el-radio-button>
      <el-radio-button value="ratio">奇偶/大小/区间</el-radio-button>
    </el-radio-group>
    <div ref="chartEl" style="width: 100%; height: 500px"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const chartType = ref('freq')
const chartEl = ref(null)
let chart = null
let offTheme = null

function computeStats() {
  const total = props.draws.length
  const freq = Array(props.cfg.redMax + 1).fill(0)
  const lastSeen = Array(props.cfg.redMax + 1).fill(-1)
  const recent = props.draws.slice(0, Math.min(10, total))
  const recentCount = Array(props.cfg.redMax + 1).fill(0)
  props.draws.forEach((d, idx) => {
    ;(d.red || []).forEach((n) => {
      if (n >= 1 && n <= props.cfg.redMax) {
        freq[n]++
        lastSeen[n] = idx
        if (idx < recent.length) recentCount[n]++
      }
    })
  })
  return { total, freq, lastSeen, recentCount }
}

/** 直位数字型统计：每个位置的 0-9 频次与最近出现期数（qxc 含尾位 0-14） */
function computeDirectStats() {
  const total = props.draws.length
  const posCount = props.cfg.digits.length
  const hasTail = !!props.cfg.tail
  const tailMax = props.cfg.tailMax ?? 9
  const rowSize = hasTail ? tailMax + 1 : 10
  const rowCount = posCount + (hasTail ? 1 : 0)
  const freq = Array.from({ length: rowCount }, () => Array(rowSize).fill(0))
  const lastSeen = Array.from({ length: rowCount }, () => Array(rowSize).fill(-1))
  props.draws.forEach((d, idx) => {
    ;(d.digits || []).forEach((dg, p) => {
      if (p < posCount && dg >= 0 && dg <= 9) {
        freq[p][dg]++
        lastSeen[p][dg] = idx
      }
    })
    if (hasTail && d.tail != null && d.tail >= 0 && d.tail <= tailMax) {
      freq[posCount][d.tail]++
      lastSeen[posCount][d.tail] = idx
    }
  })
  return { total, freq, lastSeen, rowSize }
}

function baseGrid() {
  return { left: 44, right: 24, top: 46, bottom: 56 }
}

/** 直位频次：每个位置一条折线 */
function buildDirectFreqOption(s) {
  const t = chartTheme()
  const labels = Array.from({ length: s.rowSize }, (_, i) => String(i))
  const colors = [t.red, t.blue, t.green, t.orange, t.purple, t.teal, t.gold, t.pink, t.cyan, t.warm]
  const posNames = props.cfg.digits.map((d) => d.label)
  if (props.cfg.tail) posNames.push('尾位')
  const series = s.freq.map((row, p) => ({
    name: posNames[p] || `第${p + 1}位`,
    type: 'line',
    smooth: true,
    symbolSize: 5,
    data: row,
    lineStyle: { color: colors[p % colors.length], width: 2 },
    itemStyle: { color: colors[p % colors.length] }
  }))
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    legend: { top: 4, textStyle: { fontSize: 11, color: t.text } },
    grid: baseGrid(),
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 0, fontSize: 11, color: t.text },
      axisLine: { lineStyle: { color: t.axisLine } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '出现次数',
      nameTextStyle: { color: t.text, fontSize: 11 },
      axisLabel: { color: t.text, fontSize: 11 },
      splitLine: { lineStyle: { color: t.split } }
    },
    series
  }
}

/** 直位遗漏：每个位置一条遗漏线 */
function buildDirectMissOption(s) {
  const t = chartTheme()
  const labels = Array.from({ length: s.rowSize }, (_, i) => String(i))
  const colors = [t.red, t.blue, t.green, t.orange, t.purple, t.teal, t.gold, t.pink, t.cyan, t.warm]
  const posNames = props.cfg.digits.map((d) => d.label)
  if (props.cfg.tail) posNames.push('尾位')
  const series = s.lastSeen.map((row, p) => ({
    name: posNames[p] || `第${p + 1}位`,
    type: 'line',
    smooth: true,
    symbolSize: 5,
    data: row.map((v) => (v === -1 ? s.total : s.total - v)),
    lineStyle: { color: colors[p % colors.length], width: 2 },
    itemStyle: { color: colors[p % colors.length] }
  }))
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    legend: { top: 4, textStyle: { fontSize: 11, color: t.text } },
    grid: baseGrid(),
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 0, fontSize: 11, color: t.text },
      axisLine: { lineStyle: { color: t.axisLine } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '遗漏期数',
      nameTextStyle: { color: t.text, fontSize: 11 },
      axisLabel: { color: t.text, fontSize: 11 },
      splitLine: { lineStyle: { color: t.split } }
    },
    series
  }
}

/** 直位奇偶/大小/位置分布 */
function buildDirectRatioOption(s) {
  const t = chartTheme()
  let odd = 0,
    even = 0,
    big = 0,
    small = 0
  props.draws.forEach((d) => {
    ;(d.digits || []).forEach((dg) => {
      if (dg % 2 === 1) odd++
      else even++
      if (dg >= 5) big++
      else small++
    })
    if (props.cfg.tail && d.tail != null) {
      if (d.tail % 2 === 1) odd++
      else even++
      if (d.tail >= 5) big++
      else small++
    }
  })
  const xLabels = Array.from({ length: s.rowSize }, (_, i) => String(i))
  const posNames = props.cfg.digits.map((d) => d.label)
  if (props.cfg.tail) posNames.push('尾位')
  const posLabels = s.freq.map((_, p) => posNames[p] || `第${p + 1}位`)
  const colors = [t.red, t.blue, t.green, t.orange, t.purple, t.teal, t.gold, t.pink, t.cyan, t.warm]
  const posSeries = s.freq.map((row, p) => ({
    name: posNames[p] || `第${p + 1}位`,
    type: 'bar',
    data: row.map((v) => ({ value: v, itemStyle: { color: colors[p % colors.length] } })),
    barMaxWidth: 10
  }))
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: 'item', ...tipStyle(t) },
    legend: { top: 6, textStyle: { fontSize: 11, color: t.text } },
    grid: [
      { left: '2%', top: '34%', width: '42%', height: '28%' },
      { left: '52%', top: '34%', width: '42%', height: '28%' },
      { left: '3%', top: '66%', width: '94%', height: '28%' }
    ],
    xAxis: [
      {
        type: 'category',
        gridIndex: 2,
        data: xLabels,
        axisLabel: { fontSize: 11, color: t.text },
        axisLine: { lineStyle: { color: t.axisLine } },
        axisTick: { show: false }
      }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 2,
        name: '出现次数',
        nameTextStyle: { color: t.text, fontSize: 11 },
        axisLabel: { fontSize: 11, color: t.text },
        splitLine: { lineStyle: { color: t.split } }
      }
    ],
    series: [
      {
        name: '奇偶占比',
        type: 'pie',
        radius: ['36%', '56%'],
        center: ['23%', '42%'],
        data: [
          { name: '奇数', value: odd, itemStyle: { color: t.red } },
          { name: '偶数', value: even, itemStyle: { color: t.blue } }
        ],
        label: { fontSize: 12, color: t.text, formatter: '{b} {d}%' },
        labelLine: { lineStyle: { color: t.split } }
      },
      {
        name: '大小占比',
        type: 'pie',
        radius: ['36%', '56%'],
        center: ['77%', '42%'],
        data: [
          { name: '大号 (5-9)', value: big, itemStyle: { color: t.orange } },
          { name: '小号 (0-4)', value: small, itemStyle: { color: t.green } }
        ],
        label: { fontSize: 12, color: t.text, formatter: '{b} {d}%' },
        labelLine: { lineStyle: { color: t.split } }
      },
      ...posSeries
    ],
    graphic: [
      { type: 'text', left: 'center', bottom: 4, style: { text: `共 ${odd + even} 个数字 · 按位置统计 0-9`, fontSize: 12, fill: t.text } }
    ]
  }
}

function buildFreqOption(s) {
  const t = chartTheme()
  const labels = []
  const values = []
  const colors = []
  for (let n = 1; n <= props.cfg.redMax; n++) {
    labels.push(String(n).padStart(2, '0'))
    values.push(s.freq[n])
    if (s.recentCount[n] >= 3) colors.push(t.redDeep) // 热号
    else if (s.total - s.lastSeen[n] >= 10) colors.push(t.blue) // 冷号
    else colors.push(t.gray)
  }
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    grid: baseGrid(),
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 0, fontSize: 10, rotate: 45, color: t.text },
      axisLine: { lineStyle: { color: t.axisLine } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '出现次数',
      nameTextStyle: { color: t.text, fontSize: 11 },
      axisLabel: { color: t.text, fontSize: 11 },
      splitLine: { lineStyle: { color: t.split } }
    },
    series: [
      {
        name: '出现次数',
        type: 'bar',
        data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: [3, 3, 0, 0] } })),
        barMaxWidth: 16
      }
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: 6,
        style: { text: '红色=热号(近10期≥3次)  蓝色=冷号(遗漏≥10期)  灰色=一般', fontSize: 12, fill: t.text }
      }
    ]
  }
}

function buildMissOption(s) {
  const t = chartTheme()
  const labels = []
  const values = []
  for (let n = 1; n <= props.cfg.redMax; n++) {
    labels.push(String(n).padStart(2, '0'))
    values.push(s.lastSeen[n] === -1 ? s.total : s.total - s.lastSeen[n])
  }
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: 'axis', ...tipStyle(t) },
    grid: baseGrid(),
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 0, fontSize: 10, rotate: 45, color: t.text },
      axisLine: { lineStyle: { color: t.axisLine } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '遗漏期数',
      nameTextStyle: { color: t.text, fontSize: 11 },
      axisLabel: { color: t.text, fontSize: 11 },
      splitLine: { lineStyle: { color: t.split } }
    },
    series: [
      {
        name: '当前遗漏',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: values,
        lineStyle: { color: t.blue, width: 2 },
        itemStyle: { color: t.blue },
        areaStyle: { color: t.blueSoft },
        markLine: {
          symbol: 'none',
          data: [{ yAxis: 10 }],
          lineStyle: { type: 'dashed', color: t.red },
          label: { formatter: '冷号线 10', color: t.red, fontSize: 11 }
        }
      }
    ]
  }
}

function buildRatioOption(s) {
  const t = chartTheme()
  let odd = 0,
    even = 0,
    big = 0,
    small = 0
  const mid = (props.cfg.redMax + 1) / 2
  const zones = [0, 0, 0]
  props.draws.forEach((d) => {
    ;(d.red || []).forEach((n) => {
      if (n % 2 === 1) odd++
      else even++
      if (n > mid) big++
      else small++
      const z = n <= props.cfg.zoneEdges[0] ? 0 : n <= props.cfg.zoneEdges[1] ? 1 : 2
      zones[z]++
    })
  })
  const totalNums = odd + even
  const zoneLabels = props.cfg.zoneNames
  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: 'item', ...tipStyle(t) },
    legend: { top: 6, textStyle: { fontSize: 12, color: t.text } },
    grid: [
      { left: '2%', top: '32%', width: '44%', height: '30%' },
      { left: '52%', top: '32%', width: '44%', height: '30%' },
      { left: '5%', top: '68%', width: '92%', height: '26%' }
    ],
    xAxis: [
      {
        type: 'category',
        gridIndex: 2,
        data: zoneLabels,
        axisLabel: { fontSize: 12, color: t.text },
        axisLine: { lineStyle: { color: t.axisLine } },
        axisTick: { show: false }
      }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 2,
        name: '出现次数',
        nameTextStyle: { color: t.text, fontSize: 11 },
        axisLabel: { fontSize: 11, color: t.text },
        splitLine: { lineStyle: { color: t.split } }
      }
    ],
    series: [
      {
        name: '奇偶占比',
        type: 'pie',
        radius: ['38%', '58%'],
        center: ['24%', '40%'],
        data: [
          { name: '奇数', value: odd, itemStyle: { color: t.red } },
          { name: '偶数', value: even, itemStyle: { color: t.blue } }
        ],
        label: { fontSize: 12, color: t.text, formatter: '{b} {d}%' },
        labelLine: { lineStyle: { color: t.split } }
      },
      {
        name: '大小占比',
        type: 'pie',
        radius: ['38%', '58%'],
        center: ['76%', '40%'],
        data: [
          { name: `大号 (>${Math.floor(mid)})`, value: big, itemStyle: { color: t.orange } },
          { name: `小号 (≤${Math.floor(mid)})`, value: small, itemStyle: { color: t.green } }
        ],
        label: { fontSize: 12, color: t.text, formatter: '{b} {d}%' },
        labelLine: { lineStyle: { color: t.split } }
      },
      {
        name: '区间分布',
        type: 'bar',
        data: zones.map((v, i) => ({
          value: v,
          itemStyle: { color: [t.warm, t.purple, t.teal][i], borderRadius: [3, 3, 0, 0] }
        })),
        barMaxWidth: 60,
        label: { show: true, position: 'top', color: t.text, fontSize: 11 }
      }
    ],
    graphic: [
      { type: 'text', left: '6%', top: 8, style: { text: `共 ${totalNums} 个${props.cfg.redLabel}`, fontSize: 12, fill: t.text } }
    ]
  }
}

function render() {
  if (!chartEl.value) return
  if (!chart) chart = echarts.init(chartEl.value)
  let option
  if (props.cfg.direct) {
    const s = computeDirectStats()
    if (chartType.value === 'freq') option = buildDirectFreqOption(s)
    else if (chartType.value === 'miss') option = buildDirectMissOption(s)
    else option = buildDirectRatioOption(s)
  } else {
    const s = computeStats()
    if (chartType.value === 'freq') option = buildFreqOption(s)
    else if (chartType.value === 'miss') option = buildMissOption(s)
    else option = buildRatioOption(s)
  }
  chart.setOption(option, true)
}

function onResize() {
  if (chart) chart.resize()
}

watch([chartType, () => props.draws], render)
onMounted(() => {
  render()
  window.addEventListener('resize', onResize)
  offTheme = onThemeChange(render)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (offTheme) offTheme()
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>
