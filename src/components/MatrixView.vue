<template>
  <div>
    <div class="card-title">号码分布矩阵</div>

    <div class="toolbar">
      <el-radio-group v-model="range" size="small" @change="reload">
        <el-radio-button label="30">近30期</el-radio-button>
        <el-radio-button label="50">近50期</el-radio-button>
        <el-radio-button label="100">近100期</el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>
      <span class="dim" style="font-size: 12px">颜色越深 = 出现次数越多；区段下方为区段出现占比</span>
    </div>

    <div v-if="!sliceDraws.length" class="empty-wrap">
      <el-empty description="暂无开奖数据，请先刷新数据" style="padding: 60px 0" />
    </div>

    <template v-else>
      <!-- 乐透/组合彩 -->
      <template v-if="!isDirect">
        <div class="matrix-card">
          <div class="matrix-title red-title">红球区段频率矩阵（共 {{ sliceDraws.length }} 期）</div>
          <div class="zone-grid">
            <div v-for="(zone, zi) in redZones" :key="'z' + zi" class="zone-block">
              <div class="zone-head">
                <span class="zone-name">{{ zone.name }}</span>
                <span class="zone-total">占比 {{ zone.pct }}%</span>
              </div>
              <div class="cell-grid">
                <div
                  v-for="n in zone.nums"
                  :key="'n' + n"
                  class="freq-cell"
                  :class="{ hot: cellLevel(zone.freq[n]) >= 3 }"
                  :style="cellBg(zone.freq[n], zone.max)"
                  @click="cellClick(n)"
                >
                  <span class="cell-num">{{ pad2(n) }}</span>
                  <span class="cell-freq">{{ zone.freq[n] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="matrix-card">
          <div class="matrix-title blue-title">蓝球频率矩阵</div>
          <div class="cell-grid blue-grid">
            <div
              v-for="n in blueNums"
              :key="'b' + n"
              class="freq-cell"
              :class="{ hot: cellLevel(blueFreq[n]) >= 3 }"
              :style="cellBg(blueFreq[n], blueMax)"
            >
              <span class="cell-num">{{ pad2(n) }}</span>
              <span class="cell-freq">{{ blueFreq[n] }}</span>
            </div>
          </div>
          <div class="dim" style="font-size: 11px; margin-top: 6px">蓝色数字 = 蓝球（大乐透后区 1~12 合并统计 blue+blue2）</div>
        </div>
      </template>

      <!-- 直位数字彩 -->
      <template v-else>
        <div class="matrix-card">
          <div class="matrix-title red-title">每位数字频率矩阵（近 {{ sliceDraws.length }} 期）</div>
          <div v-for="(d, di) in cfg.digits" :key="'pd' + di" class="pos-matrix">
            <div class="pos-label">{{ d.label }}</div>
            <div class="cell-grid pos-grid">
              <div
                v-for="v in 10"
                :key="'p' + di + '_' + (v - 1)"
                class="freq-cell"
                :class="{ hot: cellLevel(digitFreq(di, v - 1)) >= 3 }"
                :style="cellBg(digitFreq(di, v - 1), posMax[di])"
              >
                <span class="cell-num">{{ v - 1 }}</span>
                <span class="cell-freq">{{ digitFreq(di, v - 1) }}</span>
              </div>
            </div>
          </div>
          <div v-if="cfg.tail != null" class="pos-matrix">
            <div class="pos-label blue-label">尾位</div>
            <div class="cell-grid pos-grid">
              <div
                v-for="v in (cfg.tailMax + 1)"
                :key="'t' + (v - 1)"
                class="freq-cell"
                :class="{ hot: cellLevel(tailFreq[v - 1]) >= 3 }"
                :style="cellBg(tailFreq[v - 1], tailMaxFreq)"
              >
                <span class="cell-num">{{ v - 1 }}</span>
                <span class="cell-freq">{{ tailFreq[v - 1] }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div class="dim" style="font-size: 12px; margin-top: 12px; line-height: 1.8">
        点击号码格子可快速将该号码加入自选号（暂只展示统计，不做跳转）。统计基于已加载官方开奖数据，随机事件请理性看待。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { pad2 } from '../utils/game-config'
import { computeStats, computeDirectStats } from '../utils/picker-engine'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const range = ref('50')

const isDirect = computed(() => props.cfg.playMode === 'direct')

const sliceDraws = computed(() => {
  if (!props.draws || !props.draws.length) return []
  const n = range.value === 'all' ? props.draws.length : Number(range.value)
  return props.draws.slice(0, n)
})

const stats = computed(() => (sliceDraws.value.length ? (isDirect.value ? computeDirectStats(props.cfg, sliceDraws.value) : computeStats(props.cfg, sliceDraws.value)) : null))

// ===== 乐透型 =====
const zoneCount = computed(() => (props.cfg.redMax >= 33 ? 3 : 3))
const zoneSize = computed(() => Math.ceil(props.cfg.redMax / zoneCount.value))

const redZones = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const zones = []
  for (let zi = 0; zi < zoneCount.value; zi++) {
    const start = zi * zoneSize.value + 1
    const end = Math.min(props.cfg.redMax, (zi + 1) * zoneSize.value)
    const nums = []
    const freq = {}
    let zoneSum = 0
    for (let n = start; n <= end; n++) {
      nums.push(n)
      freq[n] = s.redFreq[n] || 0
      zoneSum += freq[n]
    }
    const totalFreq = s.redFreq.reduce((a, b) => a + b, 0) || 1
    zones.push({
      name: `${pad2(start)}~${pad2(end)}`,
      nums,
      freq,
      max: Math.max(1, ...nums.map((n) => freq[n])),
      sum: zoneSum,
      pct: Math.round((zoneSum / totalFreq) * 100)
    })
  }
  return zones
})

const blueNums = computed(() => Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1))
const blueFreq = computed(() => (stats.value ? stats.value.blueFreq : []))
const blueMax = computed(() => (blueFreq.value.length ? Math.max(1, ...blueFreq.value.slice(1)) : 1))

// ===== 直位 =====
function digitFreq(p, v) {
  return stats.value ? stats.value.freq[p][v] : 0
}
const posMax = computed(() => {
  if (!stats.value) return []
  return stats.value.freq.map((arr) => Math.max(1, ...arr))
})
const tailFreq = computed(() => (stats.value && stats.value.tailFreq ? stats.value.tailFreq : []))
const tailMaxFreq = computed(() => (tailFreq.value.length ? Math.max(1, ...tailFreq.value) : 1))

// ===== 热力 =====
function cellLevel(v) {
  const mx = Math.max(1, v)
  if (mx >= 6) return 3
  if (mx >= 4) return 2
  if (mx >= 2) return 1
  return 0
}

function cellBg(v, max) {
  if (!max) return {}
  const ratio = v / max
  if (isDirect.value) {
    // 直位用蓝紫系
    const a = 0.08 + ratio * 0.72
    return { background: `rgba(106, 69, 232, ${a.toFixed(2)})` }
  }
  const a = 0.08 + ratio * 0.72
  return { background: `rgba(217, 43, 63, ${a.toFixed(2)})` }
}

function cellClick(n) {
  // 轻提示，不做复杂跳转
}

const reload = () => {}
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

.empty-wrap {
  padding: 30px 0;
}

.matrix-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 14px;
  margin-bottom: 12px;
}

.matrix-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
}

.red-title {
  color: var(--red);
}

.blue-title {
  color: var(--blue);
}

.zone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.zone-block {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px;
  background: var(--card-inset);
}

.zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.zone-name {
  font-size: 12px;
  font-weight: 700;
}

.zone-total {
  font-size: 11px;
  color: var(--text-dim);
}

.cell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
}

.pos-grid {
  grid-template-columns: repeat(10, 1fr);
  gap: 5px;
}

.blue-grid {
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
}

.freq-cell {
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--card-inset);
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: transform 0.12s;
}

.freq-cell:hover {
  transform: scale(1.06);
  border-color: var(--accent);
}

.freq-cell.hot {
  border-color: rgba(255, 255, 255, 0.5);
}

.cell-num {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
}

.cell-freq {
  font-size: 10px;
  color: var(--text-dim);
}

.pos-matrix {
  margin-bottom: 14px;
}

.pos-label {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text-main);
}
</style>
