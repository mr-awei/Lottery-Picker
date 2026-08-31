<template>
  <div>
    <div class="card-title">设置</div>

    <div class="set-card">
      <div class="set-group-title">基本设置</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">外观主题</div>
          <div class="set-desc">浅色 / 深色界面切换，选择后即时生效并自动记忆</div>
        </div>
        <el-switch
          :model-value="theme === 'dark'"
          active-text="深色"
          inactive-text="浅色"
          @change="onThemeChange"
        />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">自动刷新数据</div>
          <div class="set-desc">临近开奖时间（前 30 分钟）每分钟刷新，其余时间每 30 分钟刷新一次</div>
        </div>
        <el-switch
          :model-value="autoRefresh"
          @change="onAutoRefreshChange"
        />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">当前彩种</div>
          <div class="set-desc">顶栏切换双色球 / 大乐透，各自数据独立缓存</div>
        </div>
        <div class="dim">{{ cfg.name }} · 开奖 {{ drawDaysText }}</div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">AI 选号</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">AI 一直选上限次数</div>
          <div class="set-desc">AI 一直选最大尝试次数（1000 ~ 100 万）。达到该次数仍未达预期分时，取最高分组合</div>
        </div>
        <el-input-number v-model="maxAttempts" :min="1000" :max="1000000" :step="1000" size="small" style="width: 160px" @change="onMaxAttemptsChange" />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">暴力模式</div>
          <div class="set-desc">开启后 AI 一直选即使达到预期分也不停止，一直跑到设定次数，并统计多次出现的号码</div>
        </div>
        <el-switch v-model="violentMode" @change="onViolentModeChange" />
      </div>
      <div class="set-row" v-if="violentMode">
        <div class="set-info">
          <div class="set-label">暴力模式次数</div>
          <div class="set-desc">建议 10 万 / 100 万，次数越多耗时越长，期间可随时切走或关闭</div>
        </div>
        <el-input-number v-model="violentAttempts" :min="10000" :max="1000000" :step="10000" size="small" style="width: 160px" @change="onViolentAttemptsChange" />
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">GPU 加速</div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">启用 GPU 加速</div>
          <div class="set-desc">AI 一直选 / 暴力模式等大量候选评分由 GPU 并行计算（WebGPU 优先，不可用时自动降级 GPU.js / 多线程 / CPU）</div>
        </div>
        <el-switch :model-value="gpuAccel" @change="onGpuAccelChange" />
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">使用 GPU</div>
          <div class="set-desc">手动选择参与计算的显卡（含核显）。独显映射 high-performance、核显映射 low-power，选择“自动”时由系统调度</div>
        </div>
        <el-select :model-value="gpuDeviceIndex" size="small" style="width: 260px" placeholder="自动（系统调度）" @change="onGpuDeviceChange">
          <el-option label="自动（系统调度）" :value="-1" />
          <el-option v-for="d in gpuDevices" :key="d.index" :label="gpuDeviceLabel(d)" :value="d.index" />
        </el-select>
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">加速方案</div>
          <div class="set-desc">WebGPU / GPU.js / Worker / CPU 四选一；指定后按该方案执行，不再自动降级到其它 GPU 层</div>
        </div>
        <el-select :model-value="gpuScheme" size="small" style="width: 260px" @change="onGpuSchemeChange">
          <el-option v-for="opt in SCHEME_OPTIONS" :key="opt.key" :label="opt.label" :value="opt.key" />
        </el-select>
      </div>
      <div v-if="gpuSchemeError || gpuDeviceError" class="set-row">
        <div class="set-info">
          <div class="set-label">GPU 提示</div>
          <div class="set-desc">{{ gpuSchemeError || gpuDeviceError }}</div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">当前 GPU</div>
          <div class="set-desc">实际生效的显卡型号（选择 GPU 或运行基准测试后自动同步）</div>
        </div>
        <div class="dim">{{ currentGpuText }}</div>
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">生效层级</div>
          <div class="set-desc">L1 WebGPU Compute Shader → L2 GPU.js(WebGL2) → L3 Worker 多线程 → L4 CPU 直跑</div>
        </div>
        <div class="dim">{{ levelText }}</div>
      </div>
      <div class="set-row">
        <div class="set-info">
          <div class="set-label">基准测试</div>
          <div class="set-desc">10 万次候选评分，对比 GPU 与 CPU 耗时并输出加速比</div>
        </div>
        <div class="bench-area">
          <el-button size="small" type="primary" plain :loading="benchRunning" @click="runBench">{{ benchRunning ? '测试中…' : '开始测试' }}</el-button>
          <div v-if="benchResult" class="bench-result dim">{{ benchResult }}</div>
        </div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">更新公告</div>
      <div class="changelog-list">
        <div v-for="ver in CHANGELOG" :key="ver.version" class="changelog-item">
          <div class="changelog-head">
            <span class="changelog-version">v{{ ver.version }}</span>
            <span class="changelog-date dim">{{ ver.date }} · {{ ver.title }}</span>
          </div>
          <ul class="changelog-items">
            <li v-for="(item, i) in ver.items" :key="i">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="set-card">
      <div class="set-group-title">关于软件</div>
      <div class="about-box">
        <div class="about-name">彩票选号器</div>
        <div class="about-sub">LOTTERY PICKER v{{ APP_VERSION }}</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-line">本软件完全<b style="color: var(--success)">免费</b>，仅供个人娱乐与学习参考使用。</div>
        <div class="about-line">严禁任何个人或组织对本软件进行<b>倒卖、转售、收费代安装</b>等盈利行为；严禁将软件内置的选号引擎、统计方法用于商业用途。</div>
        <div class="about-line">软件不含任何内购、广告与付费功能，若您通过付费渠道获得本软件，请立即联系平台举报。</div>
        <el-divider style="margin: 14px 0" />
        <div class="about-line dim">理性购彩提示：彩票开奖为独立随机事件，本软件提供的所有统计、评分、推荐均不提高中奖概率，仅供组合参考。未成年人不得购彩，请量力而行。</div>
        <div class="about-line dim">数据来源：中国福利彩票发行管理中心（双色球）与中国体育彩票官方公开接口。数据可能存在延迟或异常，请以官方公告为准。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { GAME_CONFIG } from '../utils/game-config'
import { theme, applyTheme } from '../utils/ui-state'
import { APP_VERSION, CHANGELOG } from '../utils/version'
import { initGPU, getGPUInfo, runBenchmark, makeSyntheticDraws, setGPUPreference, getPreferredScheme, getPreferredDeviceIndex, SCHEME_LABELS } from '../utils/gpu-engine'
import { computeStats, computeDirectStats } from '../utils/picker-engine'

const props = defineProps({
  game: { type: String, required: true }
})

const AUTO_REFRESH_KEY = 'lp-auto-refresh'
const autoRefresh = ref(localStorage.getItem(AUTO_REFRESH_KEY) !== 'off')

// AI 选号设置：上限次数 / 暴力模式开关与次数（AiPicker 读取同一 localStorage key）
const MAX_ATTEMPTS_KEY = 'lp-ai-max-attempts'
const VIOLENT_KEY = 'lp-ai-violent'
const VIOLENT_ATTEMPTS_KEY = 'lp-ai-violent-attempts'
const maxAttempts = ref(Number(localStorage.getItem(MAX_ATTEMPTS_KEY)) || 20000)
const violentMode = ref(localStorage.getItem(VIOLENT_KEY) === 'on')
const violentAttempts = ref(Number(localStorage.getItem(VIOLENT_ATTEMPTS_KEY)) || 100000)

const GPU_ACCEL_KEY = 'lp-gpu-accel'
const gpuAccel = ref(localStorage.getItem(GPU_ACCEL_KEY) !== 'off')
const gpuName = ref('')
const gpuLevel = ref('')
const benchRunning = ref(false)
const benchResult = ref('')
// 手动选择扩展：GPU 列表 / 所选 GPU / 加速方案
const gpuDevices = ref([])
const gpuDeviceIndex = ref(-1)
const gpuScheme = ref('auto')
const gpuSchemeError = ref('')
const gpuDeviceError = ref('')
const selectedDevice = ref(null)

const SCHEME_OPTIONS = computed(() => Object.keys(SCHEME_LABELS).map((k) => ({ key: k, label: SCHEME_LABELS[k] })))

function gpuDeviceLabel(d) {
  const tag = d.isIntegrated ? '核显' : '独显'
  const act = d.active === false ? '（未激活）' : ''
  return `${d.name || ('GPU ' + d.index)} · ${tag}${act}`
}

const currentGpuText = computed(() => {
  if (selectedDevice.value) {
    return `${selectedDevice.value.name || 'GPU'}${selectedDevice.value.isIntegrated ? '（核显）' : '（独显）'}`
  }
  return gpuName.value || '探测中…'
})

const levelText = computed(() => {
  if (!gpuLevel.value) return '探测中…'
  const map = { webgpu: 'L1 WebGPU', 'gpu.js': 'L2 GPU.js', worker: 'L3 Worker 多线程', cpu: 'L4 CPU 直跑' }
  return map[gpuLevel.value] || gpuLevel.value
})

function onGpuAccelChange(val) {
  gpuAccel.value = val
  localStorage.setItem(GPU_ACCEL_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
  // 开关变化同样触发引擎重新初始化（与 GPU/方案选择一致），保证开启/关闭即时生效
  window.dispatchEvent(new CustomEvent('lp-gpu-pref-change'))
  initGPU(true)
    .then(() => refreshGPU())
    .catch(() => refreshGPU())
}

/** 保存用户选择并强制按新偏好重新初始化引擎 */
function applyGpuPref() {
  setGPUPreference(gpuScheme.value, gpuDeviceIndex.value == null ? -1 : Number(gpuDeviceIndex.value))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
  window.dispatchEvent(new CustomEvent('lp-gpu-pref-change'))
  initGPU(true)
    .then(() => refreshGPU())
    .catch(() => refreshGPU())
}

function onGpuDeviceChange(val) {
  gpuDeviceIndex.value = val == null ? -1 : Number(val)
  applyGpuPref()
}

function onGpuSchemeChange(val) {
  gpuScheme.value = val || 'auto'
  applyGpuPref()
}

async function refreshGPU() {
  const info = await getGPUInfo()
  gpuName.value = (info && info.gpuName) || ''
  gpuLevel.value = (info && info.level) || 'cpu'
  gpuDevices.value = (info && info.devices) || []
  gpuSchemeError.value = (info && info.schemeError) || ''
  gpuDeviceError.value = (info && info.deviceError) || ''
  gpuScheme.value = (info && info.scheme) || 'auto'
  const idx = (info && info.deviceIndex) != null ? info.deviceIndex : -1
  gpuDeviceIndex.value = idx
  selectedDevice.value = (info && info.selectedDevice) || null
}
// 初始加载：读取本地偏好并探测（getGPUInfo 内部会按偏好初始化）
gpuDeviceIndex.value = getPreferredDeviceIndex()
gpuScheme.value = getPreferredScheme()
refreshGPU()

async function runBench() {
  if (benchRunning.value) return
  benchRunning.value = true
  benchResult.value = ''
  try {
    const c = cfg.value
    const draws = makeSyntheticDraws(c, 60)
    const stats = c.playMode === 'direct'
      ? computeDirectStats(c, draws)
      : computeStats(c, draws)
    const res = await runBenchmark(c, stats, 100000)
    if (!res.ok) {
      benchResult.value = `不可用：${res.error || 'GPU 未就绪，请在设置页打开 GPU 加速' }`
    } else {
      const ms = res.maxErr != null && res.maxErr > 0 ? ` · 评分误差 ${res.maxErr}` : ''
      benchResult.value = `${res.level} ${res.gpuMs}ms vs CPU ${res.cpuMs}ms · 加速 ${res.speedup}x${ms}`
    }
  } catch (e) {
    benchResult.value = '测试失败：' + (e && e.message ? e.message : e)
  } finally {
    benchRunning.value = false
    // 基准测试后同步刷新 GPU 型号与层级展示
    refreshGPU()
  }
}

const cfg = computed(() => GAME_CONFIG[props.game])
const drawDaysText = computed(() => cfg.value.drawDaysText || (props.game === 'ssq' ? '每周二、四、日 21:15' : '每周一、三、六 21:25'))

function onThemeChange(val) {
  applyTheme(val ? 'dark' : 'light')
}

function onAutoRefreshChange(val) {
  autoRefresh.value = val
  localStorage.setItem(AUTO_REFRESH_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-auto-refresh-change', { detail: { on: val } }))
}

function onMaxAttemptsChange(val) {
  localStorage.setItem(MAX_ATTEMPTS_KEY, String(val || 20000))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}

function onViolentModeChange(val) {
  localStorage.setItem(VIOLENT_KEY, val ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}

function onViolentAttemptsChange(val) {
  localStorage.setItem(VIOLENT_ATTEMPTS_KEY, String(val || 100000))
  window.dispatchEvent(new CustomEvent('lp-ai-settings-change'))
}
</script>

<style scoped>
.set-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 16px 18px;
  margin-bottom: 16px;
}

.set-group-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-light);
}

.set-row:first-of-type {
  border-top: none;
}

.set-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.set-desc {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 3px;
  max-width: 520px;
}

.about-box {
  font-size: 13px;
  line-height: 2;
  color: var(--text-main);
}

.about-name {
  font-size: 20px;
  font-weight: 800;
}

.about-sub {
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changelog-item {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--card-inset);
  padding: 12px 14px;
}

.changelog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.changelog-version {
  font-size: 14px;
  font-weight: 800;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(246, 196, 83, 0.35);
  border-radius: 999px;
  padding: 2px 12px;
}

.changelog-date {
  font-size: 12px;
}

.changelog-items {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-main);
}
</style>
