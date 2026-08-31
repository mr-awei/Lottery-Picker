<template>
  <div>
    <div class="card-title">冷热号总览榜</div>

    <div class="toolbar">
      <el-radio-group v-model="range" size="small" @change="rebuild">
        <el-radio-button label="10">近10期</el-radio-button>
        <el-radio-button label="30">近30期</el-radio-button>
        <el-radio-button label="50">近50期</el-radio-button>
        <el-radio-button label="100">近100期</el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>
      <span class="dim" style="font-size: 12px">热号 = 出现频次最高 · 冷号 = 当前遗漏期数最长（统计窗口基于已加载开奖数据）</span>
    </div>

    <div v-if="!draws.length" class="empty-wrap">
      <el-empty description="暂无开奖数据，请先刷新数据" style="padding: 60px 0" />
    </div>

    <template v-else>
      <!-- 乐透/组合彩：红球 + 蓝球 -->
      <template v-if="!isDirect">
        <div class="board-grid">
          <div class="board-card">
            <div class="board-head"><span class="board-title red-title">红球热号 TOP {{ topN }}</span><span class="dim board-note">按出现次数降序</span></div>
            <div v-for="item in redHot" :key="'rh' + item.n" class="rank-row">
              <span class="rank-no">{{ item.rank }}</span>
              <span class="rank-ball ball-red ball-sm">{{ pad2(item.n) }}</span>
              <span class="rank-bar"><span class="rank-fill" :style="{ width: barPct(item.freq, maxRedFreq) }"></span></span>
              <span class="rank-num">{{ item.freq }} 次</span>
              <span class="rank-omit" :class="{ 'omit-long': item.omit >= 10 }">遗漏 {{ item.omit }}</span>
            </div>
          </div>
          <div class="board-card">
            <div class="board-head"><span class="board-title cold-title">红球冷号 TOP {{ topN }}</span><span class="dim board-note">按当前遗漏降序</span></div>
            <div v-for="item in redCold" :key="'rc' + item.n" class="rank-row">
              <span class="rank-no">{{ item.rank }}</span>
              <span class="rank-ball ball-red-soft ball-sm">{{ pad2(item.n) }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-cold" :style="{ width: omitPct(item.omit, maxRedOmit) }"></span></span>
              <span class="rank-num">{{ item.omit }} 期</span>
              <span class="rank-omit" :class="{ 'omit-hot': item.freq >= 3 }">出现 {{ item.freq }}</span>
            </div>
          </div>
          <div class="board-card">
            <div class="board-head"><span class="board-title blue-title">蓝球热号 TOP {{ blueTopN }}</span><span class="dim board-note">按出现次数降序</span></div>
            <div v-for="item in blueHot" :key="'bh' + item.n" class="rank-row">
              <span class="rank-no">{{ item.rank }}</span>
              <span class="rank-ball ball-blue ball-sm">{{ pad2(item.n) }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-blue" :style="{ width: barPct(item.freq, maxBlueFreq) }"></span></span>
              <span class="rank-num">{{ item.freq }} 次</span>
              <span class="rank-omit" :class="{ 'omit-long': item.omit >= 10 }">遗漏 {{ item.omit }}</span>
            </div>
          </div>
          <div class="board-card">
            <div class="board-head"><span class="board-title blue-title">蓝球冷号 TOP {{ blueTopN }}</span><span class="dim board-note">按当前遗漏降序</span></div>
            <div v-for="item in blueCold" :key="'bc' + item.n" class="rank-row">
              <span class="rank-no">{{ item.rank }}</span>
              <span class="rank-ball ball-blue ball-sm">{{ pad2(item.n) }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-cold" :style="{ width: omitPct(item.omit, maxBlueOmit) }"></span></span>
              <span class="rank-num">{{ item.omit }} 期</span>
              <span class="rank-omit" :class="{ 'omit-hot': item.freq >= 3 }">出现 {{ item.freq }}</span>
            </div>
          </div>
        </div>

        <div class="board-card tail-card">
          <div class="board-head"><span class="board-title">红球尾数热度（0~9）</span><span class="dim board-note">按出现次数降序</span></div>
          <div class="tail-row">
            <div v-for="item in tailRank" :key="'t' + item.t" class="tail-item">
              <span class="tail-digit">{{ item.t }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-purple" :style="{ width: barPct(item.freq, maxTailFreq) }"></span></span>
              <span class="rank-num dim">{{ item.freq }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 直位数字彩：每位热号 / 冷号 + 和值尾热度 -->
      <template v-else>
        <div class="board-grid">
          <div v-for="(d, di) in cfg.digits" :key="'pos' + di" class="board-card">
            <div class="board-head">
              <span class="board-title red-title">{{ d.label }} · 热号</span>
              <span class="dim board-note">近 {{ statDraws.length }} 期出现次数</span>
            </div>
            <div v-for="(v, vi) in posHot[di]" :key="'ph' + di + '_' + v" class="rank-row">
              <span class="rank-no">{{ vi + 1 }}</span>
              <span class="rank-ball ball-red ball-sm">{{ v }}</span>
              <span class="rank-bar"><span class="rank-fill" :style="{ width: barPct(digitFreq(di, v), maxPosFreq[di]) }"></span></span>
              <span class="rank-num">{{ digitFreq(di, v) }} 次</span>
              <span class="rank-omit" :class="{ 'omit-long': digitOmit(di, v) >= 10 }">遗漏 {{ digitOmit(di, v) }}</span>
            </div>
            <div v-if="!posHot[di] || !posHot[di].length" class="board-empty dim">该位近期无 ≥3 次热号</div>
          </div>
          <div v-for="(d, di) in cfg.digits" :key="'posc' + di" class="board-card">
            <div class="board-head">
              <span class="board-title cold-title">{{ d.label }} · 冷号</span>
              <span class="dim board-note">按当前遗漏期数降序</span>
            </div>
            <div v-for="(v, vi) in posCold[di]" :key="'pc' + di + '_' + v" class="rank-row">
              <span class="rank-no">{{ vi + 1 }}</span>
              <span class="rank-ball ball-red-soft ball-sm">{{ v }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-cold" :style="{ width: omitPct(digitOmit(di, v), maxPosOmit[di]) }"></span></span>
              <span class="rank-num">{{ digitOmit(di, v) }} 期</span>
              <span class="rank-omit" :class="{ 'omit-hot': digitFreq(di, v) >= 3 }">出现 {{ digitFreq(di, v) }}</span>
            </div>
            <div v-if="!posCold[di] || !posCold[di].length" class="board-empty dim">该位暂无遗漏 ≥10 期冷号</div>
          </div>
        </div>

        <div class="board-card tail-card">
          <div class="board-head"><span class="board-title">和值尾数热度（0~9）</span><span class="dim board-note">按出现次数降序</span></div>
          <div class="tail-row">
            <div v-for="item in sumTailRank" :key="'st' + item.t" class="tail-item">
              <span class="tail-digit">{{ item.t }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-purple" :style="{ width: barPct(item.freq, maxSumTailFreq) }"></span></span>
              <span class="rank-num dim">{{ item.freq }}</span>
            </div>
          </div>
        </div>
        <div v-if="cfg.tail != null" class="board-card tail-card">
          <div class="board-head"><span class="board-title blue-title">尾位热度（0~{{ cfg.tailMax }}）</span><span class="dim board-note">按出现次数降序</span></div>
          <div class="tail-row">
            <div v-for="item in tailPosRank" :key="'tp' + item.t" class="tail-item">
              <span class="tail-digit">{{ item.t }}</span>
              <span class="rank-bar"><span class="rank-fill rank-fill-blue" :style="{ width: barPct(item.freq, maxTailPosFreq) }"></span></span>
              <span class="rank-num dim">{{ item.freq }}</span>
            </div>
          </div>
        </div>
      </template>

      <div class="dim" style="font-size: 12px; margin-top: 12px; line-height: 1.8">
        提示：彩票开奖为独立随机事件，冷热号统计仅用于走势观察，不代表未来开奖倾向，请理性购彩。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { pad2 } from '../utils/game-config'
import { computeStats, computeDirectStats } from '../utils/picker-engine'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const range = ref('50')
const topN = ref(10)
const blueTopN = ref(6)

const isDirect = computed(() => props.cfg.playMode === 'direct')

const statDraws = computed(() => {
  if (!props.draws || !props.draws.length) return []
  const n = range.value === 'all' ? props.draws.length : Number(range.value)
  return props.draws.slice(0, n)
})

const stats = computed(() => (statDraws.value.length ? (isDirect.value ? computeDirectStats(props.cfg, statDraws.value) : computeStats(props.cfg, statDraws.value)) : null))

// ===== 乐透型 =====
const redHot = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const rows = []
  for (let n = 1; n <= props.cfg.redMax; n++) {
    rows.push({ n, freq: s.redFreq[n], omit: s.omitVal[n] != null ? s.omitVal[n] : statDraws.value.length })
  }
  return rows.filter((r) => r.freq > 0).sort((a, b) => b.freq - a.freq || a.omit - b.omit).slice(0, topN.value).map((r, i) => ({ ...r, rank: i + 1 }))
})

const redCold = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const rows = []
  for (let n = 1; n <= props.cfg.redMax; n++) {
    rows.push({ n, freq: s.redFreq[n], omit: s.omitVal[n] != null ? s.omitVal[n] : statDraws.value.length })
  }
  return rows.sort((a, b) => b.omit - a.omit || b.freq - a.freq).slice(0, topN.value).map((r, i) => ({ ...r, rank: i + 1 }))
})

const blueRows = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const rows = []
  for (let n = 1; n <= props.cfg.blueMax; n++) {
    rows.push({ n, freq: s.blueFreq[n], omit: s.blueOmit[n] != null ? s.blueOmit[n] : statDraws.value.length })
  }
  return rows
})

const blueHot = computed(() => blueRows.value.filter((r) => r.freq > 0).sort((a, b) => b.freq - a.freq || a.omit - b.omit).slice(0, blueTopN.value).map((r, i) => ({ ...r, rank: i + 1 })))
const blueCold = computed(() => blueRows.value.slice().sort((a, b) => b.omit - a.omit || b.freq - a.freq).slice(0, blueTopN.value).map((r, i) => ({ ...r, rank: i + 1 })))

const tailRank = computed(() => {
  if (!stats.value) return []
  return stats.value.tailFreq
    .map((freq, t) => ({ t, freq }))
    .sort((a, b) => b.freq - a.freq)
})

const maxRedFreq = computed(() => (redHot.value.length ? redHot.value[0].freq : 1))
const maxBlueFreq = computed(() => (blueHot.value.length ? blueHot.value[0].freq : 1))
const maxRedOmit = computed(() => (redCold.value.length ? redCold.value[0].omit : 1))
const maxBlueOmit = computed(() => (blueCold.value.length ? blueCold.value[0].omit : 1))
const maxTailFreq = computed(() => (tailRank.value.length ? tailRank.value[0].freq : 1))

// ===== 直位型 =====
const posHot = computed(() => (stats.value ? stats.value.hotPos : []))
const posCold = computed(() => (stats.value ? stats.value.coldPos : []))
const maxPosFreq = computed(() => {
  if (!stats.value) return []
  return stats.value.freq.map((arr) => Math.max(1, ...arr))
})
const maxPosOmit = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  return s.freq.map((arr, p) => {
    let mx = 1
    for (let v = 0; v < 10; v++) {
      const m = s.miss[p][v] === -1 ? statDraws.value.length : statDraws.value.length - s.miss[p][v]
      if (m > mx) mx = m
    }
    return mx
  })
})

function digitFreq(p, v) {
  return stats.value ? stats.value.freq[p][v] : 0
}
function digitOmit(p, v) {
  if (!stats.value) return 0
  const s = stats.value
  return s.miss[p][v] === -1 ? statDraws.value.length : statDraws.value.length - s.miss[p][v]
}

const sumTailRank = computed(() => {
  if (!stats.value) return []
  return stats.value.sumTailFreq
    .map((freq, t) => ({ t, freq }))
    .sort((a, b) => b.freq - a.freq)
})
const maxSumTailFreq = computed(() => (sumTailRank.value.length ? sumTailRank.value[0].freq : 1))

const tailPosRank = computed(() => {
  if (!stats.value || !stats.value.tailFreq) return []
  return stats.value.tailFreq
    .map((freq, t) => ({ t, freq }))
    .sort((a, b) => b.freq - a.freq)
})
const maxTailPosFreq = computed(() => (tailPosRank.value.length ? tailPosRank.value[0].freq : 1))

// ===== 工具 =====
function barPct(v, max) {
  if (!max) return '0%'
  return Math.max(4, Math.round((v / max) * 100)) + '%'
}
function omitPct(v, max) {
  if (!max) return '0%'
  return Math.max(4, Math.round((v / max) * 100)) + '%'
}

// 范围变化时组件重算
const rebuild = () => {}

watch(range, () => {})
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

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.board-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 12px 14px;
}

.board-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.board-title {
  font-size: 13px;
  font-weight: 700;
}

.red-title {
  color: var(--red);
}

.cold-title {
  color: var(--amber);
}

.blue-title {
  color: var(--blue);
}

.board-note {
  font-size: 11px;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.rank-no {
  width: 16px;
  text-align: center;
  font-size: 11px;
  color: var(--text-dim);
  flex: none;
}

.rank-ball {
  flex: none;
}

.rank-bar {
  flex: 1;
  height: 7px;
  border-radius: 4px;
  background: var(--border-light);
  overflow: hidden;
}

.rank-fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #ff9a8a, #d92b3f);
}

.rank-fill-cold {
  background: linear-gradient(90deg, #ffd54f, #f57c00);
}

.rank-fill-blue {
  background: linear-gradient(90deg, #8fc0ff, #1d5ad4);
}

.rank-fill-purple {
  background: linear-gradient(90deg, #b39ddb, #6a45e8);
}

.rank-num {
  width: 46px;
  text-align: right;
  font-size: 11px;
  color: var(--text-main);
  flex: none;
}

.rank-omit {
  width: 54px;
  text-align: right;
  font-size: 11px;
  color: var(--text-dim);
  flex: none;
}

.omit-long {
  color: #f56c6c;
  font-weight: 700;
}

.omit-hot {
  color: #67c23a;
  font-weight: 700;
}

.tail-card {
  margin-bottom: 12px;
}

.tail-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.tail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 30px;
}

.tail-digit {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
}

.tail-item .rank-bar {
  width: 26px;
  height: 60px;
  flex: none;
  border-radius: 4px;
}

.tail-item .rank-fill {
  border-radius: 4px;
}

.board-empty {
  padding: 10px 0;
  font-size: 12px;
}
</style>
