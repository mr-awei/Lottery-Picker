<template>
  <div>
    <div class="card-title">中奖省份统计（近 {{ draws.length }} 期一等奖）</div>
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px">
      <el-radio-group v-model="view" size="small" @change="render">
        <el-radio-button label="map">地图视图</el-radio-button>
        <el-radio-button label="bar">条形图视图</el-radio-button>
      </el-radio-group>
      <span class="dim">官方接口仅公开省级中奖分布；标注"未收录"的期数不落点。点击图形查看该省各期明细。</span>
    </div>

    <div v-if="hasWinnerData">
      <div v-show="view === 'map'" ref="mapEl" style="width: 100%; height: 560px"></div>
      <div v-show="view === 'bar'" ref="barEl" style="width: 100%; height: 560px"></div>
    </div>
    <el-empty v-else description="该彩种官方接口未提供中奖省份分布数据，暂无统计可展示" style="padding: 80px 0" />
    <div style="margin-top: 8px; display: flex; justify-content: space-between" class="dim">
      <span>收录省份：{{ points.length }} 个 · 一等奖记录：{{ totalWinners }} 条</span>
      <span>未收录中奖地址的期数：{{ missingCount }} 期</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { echarts, chartTheme, tipStyle, onThemeChange } from '../utils/echarts-setup'
import { aggregateWinners } from '../utils/map-data'
import { fmtDate, fmtMoney } from '../utils/game-config'
import chinaJson from '../assets/china.json'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const view = ref('map')
const mapEl = ref(null)
const barEl = ref(null)
let mapChart = null
let barChart = null
let mapRegistered = false
let offTheme = null

const points = computed(() => aggregateWinners(props.draws))
const totalWinners = computed(() => props.draws.reduce((acc, d) => acc + ((d.winners || []).length || 0), 0))
const missingCount = computed(() => props.draws.filter((d) => !d.winners || d.winners.length === 0).length)
const hasWinnerData = computed(() => totalWinners.value > 0)

function tooltipHtml(p) {
  let html = `<b>${p.province}</b> · 一等奖 ${p.count} 条<br/>最高单注 ¥${fmtMoney(p.amount)}`
  p.draws.slice(0, 10).forEach((d) => {
    html += `<br/>${d.issue} · ${fmtDate(d.date)} · ¥${fmtMoney(d.amount)}`
  })
  if (p.draws.length > 10) html += `<br/>… 共 ${p.draws.length} 期`
  return html
}

function renderMap() {
  if (!mapEl.value || !hasWinnerData.value) return
  const t = chartTheme()
  if (!mapChart) mapChart = echarts.init(mapEl.value)
  if (!mapRegistered) {
    echarts.registerMap('china', chinaJson)
    mapRegistered = true
  }
  const detail = points.value.reduce((m, p) => {
    m[p.province] = p
    return m
  }, {})
  const maxCount = Math.max(1, ...points.value.map((p) => p.count))
  mapChart.setOption(
    {
      animationDuration: 600,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'item',
        ...tipStyle(t),
        formatter: (params) => {
          if (params.seriesType === 'effectScatter') return tooltipHtml(detail[params.name] || params)
          return `${params.name}<br/>中奖注数：${params.value != null ? params.value : '—'}`
        }
      },
      visualMap: {
        min: 0,
        max: maxCount,
        left: 20,
        bottom: 20,
        calculable: true,
        inRange: { color: t.light ? ['#dfe6f4', '#ff9a8a', '#d92b3f'] : ['#1a2340', '#7c4dff', '#ff4d5e'] },
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
          data: points.value.map((p) => ({
            name: p.province,
            value: p.coords.concat(p.count)
          })),
          symbolSize: (val) => 8 + Math.sqrt(val[2] || 1) * 8,
          rippleEffect: { brushType: 'stroke', scale: 3 },
          itemStyle: {
            color: {
              type: 'radial',
              x: 0.3,
              y: 0.3,
              r: 1,
              colorStops: [
                { offset: 0, color: '#ffb3ab' },
                { offset: 1, color: '#ff4d5e' }
              ]
            },
            shadowBlur: 10,
            shadowColor: 'rgba(255,77,94,0.6)'
          },
          zlevel: 2
        }
      ]
    },
    true
  )
}

function renderBar() {
  if (!barEl.value || !hasWinnerData.value) return
  const t = chartTheme()
  if (!barChart) barChart = echarts.init(barEl.value)
  const sorted = [...points.value].sort((a, b) => b.count - a.count)
  const names = sorted.map((p) => p.province)
  const values = sorted.map((p) => p.count)
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
      grid: { left: 64, right: 48, top: 30, bottom: 30 },
      xAxis: {
        type: 'value',
        name: '中奖注数',
        nameTextStyle: { color: t.text, fontSize: 11 },
        minInterval: 1,
        splitLine: { lineStyle: { color: t.split } },
        axisLabel: { color: t.text, fontSize: 11 }
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
          name: '一等奖注数',
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
                { offset: 0, color: '#ff6f5e' },
                { offset: 1, color: t.redDeep }
              ]
            }
          },
          label: {
            show: true,
            position: 'right',
            color: t.red,
            fontSize: 12
          }
        }
      ]
    },
    true
  )
}

function render() {
  if (view.value === 'map') renderMap()
  else renderBar()
}

function onResize() {
  if (mapChart) mapChart.resize()
  if (barChart) barChart.resize()
}

watch(() => props.draws, render)
watch(view, () => {
  // 切换视图时确保目标容器尺寸已就绪
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
})
</script>
