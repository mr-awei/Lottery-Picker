<template>
  <div>
    <div class="card-title">文件上传查中奖</div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="可上传彩票照片（自动 OCR 识别号码）、文本文件（txt/csv）或直接粘贴文本；从最新一期往前自动追溯开奖核对，若最新一期没中会自动查更早的期次，无需手动选择。"
      style="margin-bottom: 12px"
    />

    <div class="up-panel">
      <div class="up-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.text,.csv"
          style="display: none"
          @change="onFileChange"
        />
        <input
          ref="imgInput"
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.bmp"
          style="display: none"
          @change="onImageChange"
        />
        <el-button type="danger" :loading="ocrLoading" @click="imgInput.click()">
          {{ ocrLoading ? `识别中 ${ocrProgress}%…` : '上传彩票图片（OCR）' }}
        </el-button>
        <el-button type="primary" @click="fileInput.click()">选择文本文件</el-button>
        <el-button class="ghost-btn" @click="pasteMode = !pasteMode">
          {{ pasteMode ? '收起粘贴框' : '粘贴号码文本' }}
        </el-button>
        <el-button class="ghost-btn" @click="loadSample">载入示例</el-button>
        <span v-if="fileName" class="dim">{{ fileName }}</span>
      </div>

      <div v-if="imgPreview" class="img-preview-row">
        <img :src="imgPreview" class="img-preview" alt="彩票图片预览" />
        <div class="img-preview-side">
          <div class="dim" style="font-size: 12px">OCR 识别结果可能包含期号、日期等干扰信息，已自动填入下方文本框中；请在文本框修正号码后点击「核对粘贴号码」。</div>
          <el-button size="small" class="ghost-btn" @click="imgPreview = ''">移除图片</el-button>
        </div>
      </div>

      <div v-if="pasteMode" style="margin-top: 10px">
        <el-input
          v-model="pasteText"
          type="textarea"
          :rows="6"
          placeholder="每行一注，号码以空格或逗号分隔，如：&#10;01 02 03 04 05 06 07&#10;08 09 10 11 12 13 14"
        />
        <div style="margin-top: 10px; display: flex; gap: 10px">
          <el-button type="primary" :disabled="!pasteText.trim()" @click="parseAndCheck(pasteText)">核对粘贴号码</el-button>
          <el-button class="ghost-btn" @click="pasteText = ''">清空</el-button>
        </div>
      </div>

      <div v-if="rows.length" class="issue-row">
        <span class="dim" style="font-size: 12px">
          自动追溯最近 {{ props.draws.length }} 期开奖核对；有中奖则显示命中期次，全部未中则按最新一期显示未中奖
        </span>
      </div>

      <div v-if="parseError" class="parse-error">{{ parseError }}</div>
    </div>

    <div v-if="rows.length" class="check-result">
      <div class="saved-head">
        <span class="dim">共解析 {{ rows.length }} 注</span>
        <span v-if="winCount > 0" class="win-summary">
          中奖 <b style="color: #f6c453">{{ winCount }}</b> 注 · 合计奖金 <b style="color: #f6c453">¥{{ fmtBonus(totalBonus) }}</b>
        </span>
        <span v-else class="dim">暂无中奖（已按最近 {{ props.draws.length }} 期追溯核对）</span>
        <el-button size="small" class="ghost-btn" @click="clearRows">清空结果</el-button>
      </div>

      <div v-for="(row, i) in rows" :key="i" class="pick-row" :class="{ won: row.prize && row.prize.level > 0 }">
        <div class="row-index dim">{{ i + 1 }}</div>
        <div class="pick-balls">
          <template v-if="cfg.playMode === 'direct'">
            <span v-for="(d, di) in row.digits" :key="'d' + di" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ d }}</span>
            <span v-if="row.tail != null" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ row.tail }}</span>
          </template>
          <template v-else>
            <span v-for="n in row.red" :key="'r' + n" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(n) }}</span>
            <span v-for="(b, bi) in row.blue" :key="'b' + bi" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(b) }}</span>
          </template>
        </div>
        <div class="pick-result">
          <template v-if="row.prize">
            <span v-if="row.prize.level > 0" class="prize-badge" :class="'lv' + row.prize.level">
              {{ row.prize.name }} · ¥{{ fmtBonus(row.prize.bonus) }}
            </span>
            <span v-else class="dim">未中奖</span>
            <span v-if="row.prize.level > 0" class="dim" style="font-size: 12px">
              <template v-if="cfg.playMode === 'direct'">
                命中 {{ row.prize.digitsMatch }} 位<template v-if="cfg.tail"> · 尾位{{ row.prize.tailMatch ? '中' : '未中' }}</template>
              </template>
              <template v-else>
                红 {{ row.prize.redMatch }} / 蓝 {{ row.prize.blueMatch }}
              </template>
              <template v-if="row.prize.draw"> · 第 {{ row.prize.draw.issue }} 期</template>
            </span>
            <el-button v-if="row.prize && row.prize.level > 0" size="small" text type="primary" @click="showFlow(row)">兑奖流程</el-button>
            <span v-else-if="row.prize.draw" class="dim" style="font-size: 12px">
              已按最新一期（第 {{ row.prize.draw.issue }} 期）核对
            </span>
          </template>
          <span v-else class="dim">无效行</span>
        </div>
      </div>
    </div>

    <el-dialog v-model="flowVisible" width="600px" align-center class="prize-flow-dialog" :show-close="true" append-to-body>
      <div v-if="flowData" class="prize-flow">
        <div class="pf-hero" :class="flowData.isBig ? 'pf-hero-big' : 'pf-hero-small'">
          <div class="pf-level">{{ flowData.name }}</div>
          <div class="pf-title">恭喜中奖！</div>
          <div class="pf-bonus"><span class="pf-bonus-sym">¥</span>{{ flowData.bonusText }}<span v-if="flowData.winCount > 1" class="pf-win-count">{{ flowData.winCount }} 注中奖</span></div>
          <div v-if="flowData.draw" class="pf-draw">第 {{ flowData.draw.issue }} 期 · {{ fmtDate(flowData.draw.date) }}</div>
          <div v-if="flowData.draw && flowData.draw.red" class="pf-balls">
            <span v-for="n in flowData.draw.red" :key="'r' + n" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(n) }}</span>
            <span v-for="b in [flowData.draw.blue, flowData.draw.blue2].filter(v => v != null)" :key="'b' + b" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(b) }}</span>
          </div>
          <div v-else-if="flowData.draw && flowData.draw.digits" class="pf-balls">
            <span v-for="(d, di) in flowData.draw.digits" :key="'d' + di" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ d }}</span>
            <span v-if="flowData.draw.tail != null" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ flowData.draw.tail }}</span>
          </div>
        </div>
        <template v-if="flowData.isBig">
          <div class="pf-section-title">兑奖流程</div>
          <div class="pf-steps">
            <div v-for="s in flowData.steps" :key="s.no" class="pf-step">
              <span class="pf-step-no">{{ s.no }}</span>
              <div class="pf-step-body">
                <div class="pf-step-title">{{ s.title }}</div>
                <div class="pf-step-desc">{{ s.desc }}</div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="pf-note">{{ flowData.note }}</div>
        <div v-if="flowData.isBig && flowData.note" class="pf-warn">
          <span class="pf-warn-icon">!</span>
          <span>{{ flowData.note }}</span>
        </div>
        <div class="pf-footer">
          <el-button class="pf-btn" type="danger" round @click="flowVisible = false">我知道了</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createWorker } from 'tesseract.js'
import { pad2, fmtDate } from '../utils/game-config'
import { checkTicketHistory, isBigWin, bigWinFlow, smallWinNote, fmtBonus } from '../utils/prize-check'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const fileInput = ref(null)
const imgInput = ref(null)
const fileName = ref('')
const pasteMode = ref(false)
const pasteText = ref('')
const parseError = ref('')
const rows = ref([])
const imgPreview = ref('')
const ocrLoading = ref(false)
const ocrProgress = ref(0)
const flowVisible = ref(false)
const flowData = ref(null)

const latest = computed(() => (props.draws && props.draws.length ? props.draws[0] : null))
const winCount = computed(() => rows.value.filter((r) => r.prize && r.prize.level > 0).length)
const totalBonus = computed(() => rows.value.reduce((a, r) => a + (r.prize && r.prize.bonus || 0), 0))

function onFileChange(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    parseAndCheck(String(reader.result || ''))
    if (fileInput.value) fileInput.value.value = ''
  }
  reader.readAsText(file, 'utf-8')
}

function onImageChange(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  if (imgInput.value) imgInput.value.value = ''
  const url = URL.createObjectURL(file)
  imgPreview.value = url
  runOcr(file)
}

/** OCR worker 单例：首次加载模型后复用，避免每次识别重复初始化 */
let ocrWorker = null
let ocrLogger = null

async function getOcrWorker() {
  if (!ocrWorker) {
    const ocrDir = new URL('ocr/', window.location.href).href
    ocrWorker = await createWorker('eng', 1, {
      workerPath: ocrDir + 'worker.min.js',
      corePath: ocrDir + 'tesseract-core-simd-lstm.wasm.js',
      langPath: ocrDir,
      logger: (m) => ocrLogger && ocrLogger(m)
    })
  }
  return ocrWorker
}

/** 使用 tesseract.js 本地 OCR 识别彩票图片（资源已本地化到 public/ocr，避免 CDN 不稳定） */
async function runOcr(file) {
  ocrLoading.value = true
  ocrProgress.value = 0
  parseError.value = ''
  try {
    ocrLogger = (m) => {
      if (m.status === 'recognizing text') ocrProgress.value = Math.round((m.progress || 0) * 100)
    }
    const worker = await getOcrWorker()
    const ret = await worker.recognize(file)
    const text = String(ret.data.text || '')
    if (!text.trim()) {
      parseError.value = 'OCR 未识别到任何文字，请换一张更清晰的彩票图片（避免反光、折痕）'
      return
    }
    pasteMode.value = true
    pasteText.value = text.trim()
    parseAndCheck(text)
  } catch (err) {
    console.error('OCR failed:', err)
    parseError.value = 'OCR 识别失败：' + (err && err.message ? err.message : String(err))
  } finally {
    ocrLoading.value = false
    ocrProgress.value = 0
  }
}

/** 解析一行号码：提取所有数字（过滤日期/期号/金额等长数字干扰），按彩种拆分红/蓝；直位玩法解析为 digits/tail */
function parseLine(line, cfg) {
  if (cfg.playMode === 'direct') {
    const nums = (line.match(/\d/g) || []).map(Number)
    const nPos = cfg.digits ? cfg.digits.length : 0
    const need = nPos + (cfg.tail ? 1 : 0)
    if (nums.length < need) return null
    const digits = nums.slice(0, nPos)
    const tail = cfg.tail ? nums[nPos] : null
    return { digits, tail }
  }
  const nums = (line.match(/\d+/g) || [])
    .filter((s) => s.length <= 2)
    .map(Number)
    .filter((n) => n >= 1 && n <= cfg.redMax)
  const need = cfg.redCount + cfg.blueCount
  if (nums.length < need) return null
  const red = nums.slice(0, cfg.redCount)
  const blue = nums.slice(cfg.redCount, cfg.redCount + cfg.blueCount)
  if (red.some((n) => n > cfg.redMax) || blue.some((n) => n > cfg.blueMax)) return null
  return { red: [...new Set(red)].sort((a, b) => a - b), blue: [...new Set(blue)].sort((a, b) => a - b) }
}

/** 将兑奖流程文本解析为结构化弹窗数据 */
function buildFlowData(prize, text) {
  const isBig = isBigWin(prize)
  const lines = (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const steps = []
  let note = ''
  lines.forEach((line) => {
    const m = line.match(/^(\d+)\.\s*([^：:]+)[：:]\s*(.*)$/)
    if (m) {
      steps.push({ no: Number(m[1]), title: m[2], desc: m[3] || '' })
    } else if (line.indexOf('温馨提示') === 0) {
      note = line
    }
  })
  return {
    isBig,
    name: prize ? prize.name : '',
    bonusText: prize ? fmtBonus(prize.bonus) : '',
    winCount: prize ? prize.winCount || 1 : 1,
    draw: prize && prize.draw ? prize.draw : null,
    steps,
    note
  }
}

function showFlow(row) {
  const pr = row.prize && row.prize.best ? row.prize.best : row.prize
  flowData.value = buildFlowData(pr, isBigWin(pr) ? bigWinFlow(props.cfg, pr) : smallWinNote(props.cfg, pr))
  flowVisible.value = true
}

function parseAndCheck(text) {
  parseError.value = ''
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) {
    parseError.value = '未解析到任何号码行'
    rows.value = []
    return
  }
  const out = []
  lines.forEach((line) => {
    const nums = parseLine(line, props.cfg)
    if (!nums) {
      out.push(props.cfg.playMode === 'direct' ? { digits: [], tail: null, prize: null } : { red: [], blue: [], prize: null })
      return
    }
    // 从最新一期往前自动追溯：有中奖即返回命中期次，全部未中则按最新一期返回未中奖
    const ticket = props.cfg.playMode === 'direct'
      ? { type: 'single', digits: nums.digits, tail: nums.tail }
      : { type: 'single', red: nums.red, blue: nums.blue }
    const checked = props.draws && props.draws.length
      ? checkTicketHistory(props.cfg, ticket, props.draws)
      : null
    out.push({ ...nums, prize: checked })
  })
  rows.value = out
  const valid = out.filter((r) => props.cfg.playMode === 'direct' ? r.digits.length : r.red.length).length
  if (valid === 0) {
    const nPos = props.cfg.digits ? props.cfg.digits.length : 0
    const needDesc = props.cfg.playMode === 'direct'
      ? `每行需 ${nPos} 个数字${props.cfg.tail ? ' + 1 个尾位' : ''}`
      : `每行需 ${props.cfg.redCount} 个红球 + ${props.cfg.blueCount} 个蓝球`
    parseError.value = `共 ${lines.length} 行，均无法解析（${needDesc}，号码用空格或逗号分隔）`
  }
  // 命中大奖自动弹出兑奖流程
  const big = out.find((r) => r.prize && r.prize.best && isBigWin(r.prize.best))
  if (big) {
    flowData.value = buildFlowData(big.prize.best, bigWinFlow(props.cfg, big.prize.best))
    flowVisible.value = true
  }
}

function loadSample() {
  const sample = props.cfg.playMode === 'direct'
    ? (() => {
        const nPos = props.cfg.digits ? props.cfg.digits.length : 0
        const rows = []
        for (let r = 0; r < 3; r++) {
          const line = []
          for (let i = 0; i < nPos; i++) line.push((r * 3 + i) % 10)
          if (props.cfg.tail) line.push((r * 7 + 3) % (props.cfg.tailMax + 1))
          rows.push(line.join(' '))
        }
        return rows.join('\n')
      })()
    : props.cfg.key === 'ssq'
      ? '01 02 03 04 05 06 07\n08 09 10 11 12 13 14\n15 16 17 18 19 20 21'
      : '01 02 03 04 05 06 07\n08 09 10 11 12 13 14\n15 16 17 18 19 20 21 22'
  pasteText.value = sample
  pasteMode.value = true
}

function clearRows() {
  rows.value = []
  fileName.value = ''
}

/** 切换期次时按所选期次重新核对（自动追溯模式：数据刷新后重查全部行） */
watch(() => props.draws, () => {
  if (!props.draws || !props.draws.length || !rows.value.length) return
  rows.value = rows.value.map((r) => {
    if (props.cfg.playMode === 'direct' ? !r.digits.length : !r.red.length) return r
    const ticket = props.cfg.playMode === 'direct'
      ? { type: 'single', digits: r.digits, tail: r.tail }
      : { type: 'single', red: r.red, blue: r.blue }
    const checked = checkTicketHistory(props.cfg, ticket, props.draws)
    return { ...r, prize: checked }
  })
}, { immediate: true })
</script>

<style scoped>
/* 次级操作按钮：浅色主题下用白底+明显灰边框+深色文字，避免被误认为禁用 */
.ghost-btn {
  --el-button-bg-color: #ffffff;
  --el-button-border-color: var(--accent);
  --el-button-text-color: #2a3350;
  --el-button-hover-bg-color: #fff7e0;
  --el-button-hover-border-color: var(--accent-strong);
  --el-button-hover-text-color: #a87b00;
  --el-button-active-bg-color: #f7ecd0;
  --el-button-active-border-color: var(--accent-strong);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(30, 40, 80, 0.08);
}
html.dark .ghost-btn {
  --el-button-bg-color: var(--surface-2);
  --el-button-border-color: var(--border-strong);
  --el-button-text-color: var(--text-primary);
  --el-button-hover-bg-color: var(--surface-1);
  --el-button-hover-border-color: var(--accent);
  --el-button-hover-text-color: var(--accent);
  box-shadow: none;
}

.up-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  padding: 16px;
  margin-bottom: 14px;
}

.up-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.img-preview-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-top: 12px;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: 10px;
}

.img-preview {
  max-width: 220px;
  max-height: 160px;
  border-radius: var(--r-sm);
  object-fit: contain;
  background: var(--bg-base);
}

.img-preview-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.issue-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.ctrl-label {
  font-size: 13px;
  color: var(--text-muted);
}

.parse-error {
  margin-top: 12px;
  color: #f56c6c;
  font-size: 13px;
}

.check-result {
  margin-top: 6px;
}

.saved-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.win-summary {
  font-size: 13px;
}

.pick-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.pick-row.won {
  border-color: rgba(246, 196, 83, 0.55);
  background: linear-gradient(90deg, rgba(246, 196, 83, 0.10), var(--card-bg) 60%);
}

.row-index {
  width: 24px;
  text-align: center;
  font-size: 12px;
}

.pick-balls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.pick-result {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.prize-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.lv1 {
  background: linear-gradient(90deg, #ffd54f, #ffb300);
  color: #3e2723;
}

.lv2 {
  background: linear-gradient(90deg, #b0bec5, #90a4ae);
  color: #1c2833;
}

.lv3,
.lv4 {
  background: rgba(255, 152, 0, 0.22);
  color: #ffb74d;
}

.lv5,
.lv6 {
  background: rgba(76, 175, 80, 0.20);
  color: #81c784;
}

.lv7,
.lv8,
.lv9 {
  background: rgba(33, 150, 242, 0.20);
  color: #64b5f6;
}
</style>

<style>
/* ============ 中奖弹窗（挂载于 body，需全局样式，与 MyPicks 一致） ============ */
.prize-flow-dialog.el-dialog {
  border-radius: var(--r-lg);
  overflow: visible !important;
  border: 1px solid var(--border);
  background: var(--surface-1);
  box-shadow: var(--shadow-3);
  padding: 0;
  max-width: calc(100vw - 48px);
}

.prize-flow-dialog .el-dialog__header {
  display: none;
}

.prize-flow-dialog .el-dialog__body {
  padding: 0;
}

.prize-flow {
  background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%);
  animation: pf-pop 0.32s var(--ease-out);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
  overscroll-behavior: contain;
}

@keyframes pf-pop {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.pf-hero {
  position: relative;
  text-align: center;
  padding: 24px 24px 14px;
  overflow: visible;
  flex: none;
}

.pf-hero-big {
  background:
    radial-gradient(ellipse at 50% -20%, rgba(246, 196, 83, 0.28), transparent 62%),
    linear-gradient(180deg, #1d2745 0%, var(--surface-2) 100%);
}

.pf-hero-small {
  background:
    radial-gradient(ellipse at 50% -20%, rgba(61, 123, 255, 0.22), transparent 62%),
    linear-gradient(180deg, #16203a 0%, var(--surface-2) 100%);
}

.pf-level {
  display: inline-block;
  padding: 4px 14px;
  border-radius: var(--r-full);
  font-size: var(--fs-13);
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.pf-hero-big .pf-level {
  background: linear-gradient(90deg, #ffd54f, #ffb300);
  color: #3e2723;
  box-shadow: 0 2px 10px rgba(255, 179, 0, 0.4);
}

.pf-hero-small .pf-level {
  background: rgba(61, 123, 255, 0.18);
  color: #7fa8ff;
  border: 1px solid rgba(61, 123, 255, 0.35);
}

.pf-title {
  font-size: var(--fs-24);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.pf-bonus {
  margin-top: 6px;
  font-size: var(--fs-32);
  font-weight: 800;
  line-height: 1.15;
}

.pf-hero-big .pf-bonus {
  color: var(--accent-strong);
  text-shadow: 0 0 22px rgba(246, 196, 83, 0.35);
}

.pf-hero-small .pf-bonus {
  color: #7fa8ff;
}

.pf-bonus-sym {
  font-size: var(--fs-20);
  margin-right: 2px;
}

.pf-win-count {
  display: inline-block;
  margin-left: 8px;
  font-size: var(--fs-12);
  font-weight: 600;
  color: var(--text-secondary);
  vertical-align: middle;
}

.pf-draw {
  margin-top: 4px;
  font-size: var(--fs-12);
  color: var(--text-muted);
}

.pf-balls {
  margin-top: 6px;
  display: flex;
  justify-content: center;
  gap: 4px;
}

.pf-section-title {
  padding: 0 24px 6px;
  font-size: var(--fs-13);
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 2px;
  flex: none;
}

.pf-steps {
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pf-step {
  display: flex;
  gap: 12px;
  padding: 6px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.pf-step-no {
  flex: 0 0 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-13);
  font-weight: 800;
  color: #3e2723;
  background: linear-gradient(90deg, #ffd54f, #ffb300);
}

.pf-step-body {
  flex: 1;
  min-width: 0;
}

.pf-step-title {
  font-size: var(--fs-14);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0;
}

.pf-step-desc {
  font-size: var(--fs-12);
  line-height: 1.5;
  color: var(--text-secondary);
}

.pf-note {
  margin: 4px 24px 0;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px dashed var(--border-strong);
  background: var(--surface-2);
  font-size: var(--fs-12);
  line-height: 1.6;
  color: var(--text-secondary);
  flex: none;
}

.pf-warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 24px 0;
  padding: 8px 14px;
  border-radius: var(--r-md);
  background: rgba(255, 77, 94, 0.10);
  border: 1px solid rgba(255, 77, 94, 0.25);
  font-size: var(--fs-12);
  line-height: 1.7;
  color: var(--text-secondary);
  flex: none;
}

.pf-warn-icon {
  flex: 0 0 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: var(--fs-12);
  font-weight: 800;
  text-align: center;
  line-height: 18px;
}

.pf-footer {
  padding: 12px 24px 16px;
  text-align: center;
  flex: none;
}

.pf-btn {
  min-width: 160px;
  font-weight: 700;
}

/* 浅色主题适配 */
html.light .pf-hero-big {
  background:
    radial-gradient(ellipse at 50% -20%, rgba(246, 196, 83, 0.35), transparent 62%),
    linear-gradient(180deg, #fff6e0 0%, #fdfaf3 100%);
}

html.light .pf-hero-small {
  background:
    radial-gradient(ellipse at 50% -20%, rgba(61, 123, 255, 0.20), transparent 62%),
    linear-gradient(180deg, #eaf1ff 0%, #fbfdff 100%);
}

html.light .pf-hero-big .pf-level {
  color: #5d4000;
}

html.light .pf-step {
  background: #fff;
  border-color: #e5e8f0;
}

html.light .pf-note {
  background: #f7f9fc;
  border-color: #d8dee8;
}

html.light .pf-warn {
  background: rgba(255, 77, 94, 0.08);
}

html.light .prize-flow {
  background: linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%);
}
</style>
