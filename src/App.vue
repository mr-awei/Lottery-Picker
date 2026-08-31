<template>
  <div class="app" :class="'theme-' + activeGame">
    <header class="app-header">
      <div class="brand">
        <div class="brand-logo">
          <span class="logo-ball b1"></span>
          <span class="logo-ball b2"></span>
          <span class="logo-ball b3"></span>
        </div>
        <div>
          <div class="brand-title">彩票选号器</div>
          <div class="brand-sub">LOTTERY PICKER</div>
        </div>
      </div>
      <div class="app-actions">
        <span class="status-pill" v-if="statusText">
          <i class="dot" :class="{ warn: statusWarn }"></i>{{ statusText }}
        </span>
        <span v-if="nextDrawText" class="next-draw">{{ nextDrawText }}</span>
        <div class="game-switch">
          <button
            v-for="g in GAME_LIST"
            :key="g.key"
            :class="{ active: activeGame === g.key }"
            @click="switchGame(g.key)"
          >{{ g.name }}</button>
        </div>
        <button class="theme-btn" :title="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'" @click="toggleTheme">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
          </svg>
        </button>
        <el-button class="refresh-btn" :loading="refreshing" @click="refreshAll">
          {{ refreshing ? '刷新中…' : '刷新数据' }}
        </el-button>
      </div>
    </header>
    <div class="app-body">
      <transition name="fade" mode="out-in">
        <LotteryBoard
          :key="activeGame"
          :game="activeGame"
          :draws="draws[activeGame]"
          :loading="loading[activeGame]"
          :error="error[activeGame]"
          @retry="loadGame(activeGame, true)"
        />
      </transition>
    </div>

    <el-dialog
      v-model="tipVisible"
      :show-close="false"
      width="440px"
      class="daily-tip-dialog"
      align-center
      append-to-body
    >
      <div class="tip-box">
        <div class="tip-orb">
          <span class="tip-ball tb1"></span>
          <span class="tip-ball tb2"></span>
          <span class="tip-ball tb3"></span>
        </div>
        <div class="tip-title">理性购彩提醒</div>
        <div class="tip-sub">RATIONAL LOTTERY NOTICE</div>
        <ul class="tip-list">
          <li v-for="(line, i) in tipLines" :key="i">{{ line }}</li>
        </ul>
        <el-button class="tip-btn" type="danger" round @click="tipVisible = false">我知道了</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import LotteryBoard from './components/LotteryBoard.vue'
import { theme, toggleTheme } from './utils/ui-state'

const DAILY_TIP_KEY = 'lp-daily-tip'

function todayStr() {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const tipVisible = ref(false)
const tipLines = [
  '彩票开奖为独立随机事件，本软件所有选号、评分、统计与推荐均不提高中奖概率，仅供娱乐参考。',
  '本软件完全免费，不含任何内购、广告与付费功能。',
  '若您通过付费渠道（收费代购、倒卖、转售、付费安装等）获得本软件，请立即要求退款，并向所在平台举报。',
  '未成年人禁止购彩；请理性投注、量力而行，切勿沉迷。'
]

/** 每天首次打开弹窗：理性购彩 + 免费声明 */
function showDailyTipIfNeeded() {
  try {
    if (localStorage.getItem(DAILY_TIP_KEY) === todayStr()) return
    localStorage.setItem(DAILY_TIP_KEY, todayStr())
    tipVisible.value = true
  } catch (e) {
    /* 存储不可用时忽略弹窗 */
  }
}

const activeGame = ref('ssq')

/** 彩种列表：key 与 game-config.js GAME_CONFIG 一致 */
const GAME_LIST = [
  { key: 'ssq', name: '双色球' },
  { key: 'dlt', name: '大乐透' },
  { key: 'qlc', name: '七乐彩' },
  { key: 'kl8', name: '快乐8' },
  { key: 'fc3d', name: '福彩3D' },
  { key: 'pl3', name: '排列3' },
  { key: 'pl5', name: '排列5' },
  { key: 'qxc', name: '7星彩' }
]
const GAME_NAMES = Object.fromEntries(GAME_LIST.map((g) => [g.key, g.name]))
const GAME_KEYS = GAME_LIST.map((g) => g.key)

const draws = reactive(Object.fromEntries(GAME_KEYS.map((k) => [k, null])))
const loading = reactive(Object.fromEntries(GAME_KEYS.map((k) => [k, false])))
const error = reactive(Object.fromEntries(GAME_KEYS.map((k) => [k, ''])))
const refreshing = ref(false)
const statusText = ref('')
const statusWarn = ref(false)
const nextDrawText = ref('')
const AUTO_REFRESH_KEY = 'lp-auto-refresh'

/** 各彩种开奖配置：周几(JS getDay: 0=周日)与开奖时刻(时/分) */
const DRAW_SCHEDULE = {
  ssq: { days: [0, 2, 4], hour: 21, minute: 15, name: '双色球' },
  dlt: { days: [1, 3, 6], hour: 21, minute: 25, name: '大乐透' },
  qlc: { days: [1, 3, 5], hour: 21, minute: 15, name: '七乐彩' },
  kl8: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 30, name: '快乐8' },
  fc3d: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 15, name: '福彩3D' },
  pl3: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 25, name: '排列3' },
  pl5: { days: [0, 1, 2, 3, 4, 5, 6], hour: 21, minute: 25, name: '排列5' },
  qxc: { days: [2, 5, 0], hour: 21, minute: 25, name: '7星彩' }
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 短时间：当天仅 HH:mm，否则 MM-dd HH:mm */
function fmtTimeShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const p = (x) => String(x).padStart(2, '0')
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
    return hm
  }
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`
}

function nextDraw(game) {
  const s = DRAW_SCHEDULE[game]
  if (!s) return null
  const now = new Date()
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now)
    d.setDate(now.getDate() + offset)
    d.setHours(s.hour, s.minute, 0, 0)
    if (s.days.includes(d.getDay()) && d.getTime() > now.getTime()) {
      return { dayOffset: offset, time: d }
    }
  }
  return null
}

function updateNextDrawText() {
  const n = nextDraw(activeGame.value)
  if (!n) {
    nextDrawText.value = ''
    return
  }
  const s = DRAW_SCHEDULE[activeGame.value]
  const diff = n.time.getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayText = n.dayOffset === 0 ? '今天' : n.dayOffset === 1 ? '明天' : dayNames[n.time.getDay()]
  nextDrawText.value = `${dayText} ${pad2(s.hour)}:${pad2(s.minute)} 开奖${hours > 0 ? ` · 距开奖 ${hours} 小时 ${mins} 分` : ` · 距开奖 ${mins} 分钟`}`
}

function pad2(x) {
  return String(x).padStart(2, '0')
}

async function loadGame(game, force) {
  if (!window.lotteryAPI) {
    error[game] = '运行环境异常：未检测到主进程接口（请通过 Electron 启动）'
    return
  }
  const gname = GAME_NAMES[game] || game
  loading[game] = true
  error[game] = ''
  try {
    const r = force ? await window.lotteryAPI.refresh(game) : await window.lotteryAPI.get(game)
    if (r && r.ok) {
      draws[game] = r
      const src = r.source === 'cache' ? '缓存' : r.source === 'cache-stale' ? '缓存(抓取失败)' : '官方接口'
      statusText.value = `${gname} ${r.draws.length} 期 · ${fmtTimeShort(r.updatedAt)} · ${src}`
      statusWarn.value = r.source === 'cache-stale'
    } else {
      error[game] = (r && r.error) || '加载失败'
      statusText.value = `${gname} 数据加载失败`
      statusWarn.value = true
    }
  } catch (e) {
    error[game] = e.message || String(e)
    statusText.value = `${gname} 数据加载失败`
    statusWarn.value = true
  }
  loading[game] = false
}

function switchGame(game) {
  if (activeGame.value === game) return
  activeGame.value = game
  updateNextDrawText()
  if (!draws[game]) loadGame(game, false)
}

async function refreshAll() {
  refreshing.value = true
  await Promise.all(GAME_KEYS.map((k) => loadGame(k, true)))
  refreshing.value = false
}

let timer = null
let lastAutoRefresh = Date.now()

/** 动态刷新策略：距开奖 ≤30 分钟 → 每分钟；其余 → 每 30 分钟 */
function autoRefreshEnabled() {
  return localStorage.getItem(AUTO_REFRESH_KEY) !== 'off'
}

function autoTick() {
  updateNextDrawText()
  if (!autoRefreshEnabled()) return
  const n = nextDraw(activeGame.value)
  if (!n) return
  const minsToDraw = (n.time.getTime() - Date.now()) / 60000
  const intervalMs = minsToDraw <= 30 ? 60000 : 30 * 60000
  if (Date.now() - lastAutoRefresh >= intervalMs) {
    lastAutoRefresh = Date.now()
    loadGame(activeGame.value, true)
  }
}

function onAutoRefreshChange(e) {
  if (e && e.detail && e.detail.on) {
    lastAutoRefresh = Date.now()
  }
}

onMounted(() => {
  GAME_KEYS.forEach((k) => loadGame(k, false))
  updateNextDrawText()
  timer = setInterval(autoTick, 60000)
  window.addEventListener('lp-auto-refresh-change', onAutoRefreshChange)
  showDailyTipIfNeeded()
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('lp-auto-refresh-change', onAutoRefreshChange)
})
</script>

<style>
/* 每日理性购彩弹窗（挂载于 body，需全局样式） */
.daily-tip-dialog {
  border-radius: var(--r-lg);
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
}

.daily-tip-dialog .el-dialog__header {
  display: none;
}

.daily-tip-dialog .el-dialog__body {
  padding: 0;
}

.tip-box {
  padding: 32px 36px 30px;
  text-align: center;
  background: linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 100%);
  color: var(--text-primary);
  position: relative;
  overflow: hidden;
  animation: tip-pop 0.32s var(--ease-out);
}

@keyframes tip-pop {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.tip-box::before {
  content: '';
  position: absolute;
  top: -70px;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft) 0%, transparent 70%);
  pointer-events: none;
}

.tip-orb {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.tip-ball {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: inline-block;
  animation: tip-bounce 1.4s ease-in-out infinite;
}

.tip-ball.tb1 {
  background: radial-gradient(circle at 32% 28%, #ff9a8a, var(--red-deep) 100%);
  box-shadow: 0 4px 12px rgba(217, 43, 63, 0.45);
}

.tip-ball.tb2 {
  background: radial-gradient(circle at 32% 28%, #ffd54f, #f57c00 100%);
  box-shadow: 0 4px 12px rgba(245, 124, 0, 0.45);
  animation-delay: 0.18s;
}

.tip-ball.tb3 {
  background: radial-gradient(circle at 32% 28%, #8fc0ff, var(--blue-deep) 100%);
  box-shadow: 0 4px 12px rgba(29, 90, 212, 0.45);
  animation-delay: 0.36s;
}

@keyframes tip-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.tip-title {
  font-size: var(--fs-24);
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--accent);
  margin-bottom: 4px;
}

.tip-sub {
  font-size: var(--fs-11);
  letter-spacing: 3px;
  color: var(--text-muted);
  margin-bottom: 18px;
}

.tip-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.tip-list li {
  position: relative;
  padding-left: 18px;
  font-size: var(--fs-13);
  line-height: 1.6;
  color: var(--text-secondary);
}

.tip-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--red), var(--accent));
}

.tip-btn {
  min-width: 150px;
  font-weight: 600;
  letter-spacing: 2px;
  transition: transform var(--dur-fast) var(--ease-out);
}

.tip-btn:active {
  transform: scale(0.96);
}
</style>
