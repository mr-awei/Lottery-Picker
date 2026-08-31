<template>
  <div class="board">
    <div class="board-side">
      <div class="nav-groups">
        <div class="nav-group" v-for="group in navGroups" :key="group.name">
          <div class="nav-group-title">{{ group.name }}</div>
          <div
            v-for="item in group.items"
            :key="item.key"
            class="nav-item"
            :class="{ active: active === item.key }"
            @click="active = item.key"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </div>
      <div
        class="nav-item nav-footer"
        :class="{ active: active === 'settings' }"
        @click="active = 'settings'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        <span>设置</span>
      </div>
    </div>
    <div class="board-main">
      <el-empty v-if="error" :description="`数据加载失败：${error}`">
        <el-button type="primary" @click="$emit('retry')">重试</el-button>
      </el-empty>
      <div v-else-if="loading && !draws" class="empty-tip">数据加载中…（首次抓取约需 10~30 秒）</div>
      <div v-else-if="!draws || !draws.draws || !draws.draws.length" class="empty-tip">暂无数据，请点击右上角「刷新数据」</div>
      <transition v-else name="view" mode="out-in">
        <component :is="currentView" :key="active" v-bind="compProps" />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { GAME_CONFIG } from '../utils/game-config'
import { uiState } from '../utils/ui-state'
import HistoryTable from './HistoryTable.vue'
import DistributionChart from './DistributionChart.vue'
import TrendChart from './TrendChart.vue'
import PrizeMap from './PrizeMap.vue'
import MaxPrizeCard from './MaxPrizeCard.vue'
import PoolView from './PoolView.vue'
import HotColdBoard from './HotColdBoard.vue'
import MatrixView from './MatrixView.vue'
import AiPicker from './AiPicker.vue'
import MyPicks from './MyPicks.vue'
import FileCheck from './FileCheck.vue'
import SplitTool from './SplitTool.vue'
import ChasePlan from './ChasePlan.vue'
import KnowledgeView from './KnowledgeView.vue'
import SettingsView from './SettingsView.vue'

const props = defineProps({
  game: { type: String, required: true },
  draws: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
})

const cfg = computed(() => GAME_CONFIG[props.game])
const active = ref(uiState.tab)

watch(active, (v) => {
  uiState.tab = v
})

const VIEWS = {
  history: HistoryTable,
  distribution: DistributionChart,
  trend: TrendChart,
  map: PrizeMap,
  maxprize: MaxPrizeCard,
  pool: PoolView,
  hotcold: HotColdBoard,
  matrix: MatrixView,
  ai: AiPicker,
  mypicks: MyPicks,
  filecheck: FileCheck,
  split: SplitTool,
  chase: ChasePlan,
  knowledge: KnowledgeView,
  settings: SettingsView
}

const currentView = computed(() => VIEWS[active.value] || HistoryTable)

/** 不同组件接收不同 props：设置页只需 game，知识页无需 props，其余传 draws/cfg */
const compProps = computed(() => {
  if (active.value === 'settings') return { game: props.game }
  if (active.value === 'knowledge') return {}
  return { draws: props.draws.draws, cfg: cfg.value }
})

const navGroups = [
  {
    name: '数据分析',
    items: [
      { key: 'history', label: '往期号码', icon: 'M4 6h16M4 12h16M4 18h10' },
      { key: 'distribution', label: '分布图', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
      { key: 'trend', label: '走势图', icon: 'M3 17l5-5 4 3 6-7 3 3' },
      { key: 'map', label: '中奖地图', icon: 'M9 20l-6 2V6l6-2 6 2 6-2v16l-6 2-6-2zM9 4v16M15 6v16' },
      { key: 'maxprize', label: '最大奖', icon: 'M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 7.7l5.4-.8zM8 20h8M12 15v5' },
      { key: 'pool', label: '奖池销量', icon: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
      { key: 'hotcold', label: '冷热号', icon: 'M12 3a5 5 0 00-5 5v1a5 5 0 0010 0V8a5 5 0 00-5-5zM8 15v1a4 4 0 008 0v-1M12 20v2' },
      { key: 'matrix', label: '号码矩阵', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' }
    ]
  },
  {
    name: '选号工具',
    items: [
      { key: 'ai', label: 'AI 选号', icon: 'M12 3a5 5 0 00-5 5v1a5 5 0 0010 0V8a5 5 0 00-5-5zM8 15v1a4 4 0 008 0v-1M12 20v2' },
      { key: 'mypicks', label: '自选号', icon: 'M12 4l1.6 3.4 3.8.5-2.8 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7L6.6 7.9l3.8-.5zM5 20h14' },
      { key: 'filecheck', label: '查中奖', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6' },
      { key: 'split', label: '复式拆票', icon: 'M8 3h8v4H8zM4 7h16v4H4zM6 11h12v10H6zM10 15h4' },
      { key: 'chase', label: '追号计划', icon: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }
    ]
  },
  {
    name: '系统',
    items: [
      { key: 'knowledge', label: '选号知识', icon: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2zM9 3v18M12 8l2 2 2-2' }
    ]
  }
]
</script>

<style scoped>
/* 页面切换动效 */
.view-enter-active,
.view-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}

.view-enter-from {
  opacity: 0;
  transform: translateX(14px);
}

.view-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>
