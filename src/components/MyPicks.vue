<template>
  <div class="mypicks">
    <div class="card-title">自选号 · 本地保存</div>

    <div class="play-bar">
      <el-radio-group v-if="!isDirect" v-model="playType" size="small">
        <el-radio-button value="single">单注</el-radio-button>
        <el-radio-button value="multi">多注</el-radio-button>
        <el-radio-button value="duplex">复式</el-radio-button>
        <el-radio-button value="danTuo">胆拖</el-radio-button>
      </el-radio-group>
      <el-radio-group v-else v-model="playType" size="small">
        <el-radio-button value="single">单注</el-radio-button>
        <el-radio-button value="multi">多注</el-radio-button>
        <el-radio-button value="duplex">定位复式</el-radio-button>
      </el-radio-group>
      <el-radio-group v-if="isDirect && canZx" v-model="zxType" size="small" style="margin-left: 10px">
        <el-radio-button value="direct">直选</el-radio-button>
        <el-radio-button value="zuxuan3">组选3</el-radio-button>
        <el-radio-button value="zuxuan6">组选6</el-radio-button>
      </el-radio-group>
      <el-checkbox v-if="cfg.zhuijia" v-model="append">大乐透追加投注（每注 +1 元，一/二等奖奖金 ×1.8）</el-checkbox>
      <span class="dim" style="font-size: 12px">
        {{ playHint }}
      </span>
    </div>

    <div class="pick-panel">
      <template v-if="isDirect">
        <div v-for="(d, di) in cfg.digits" :key="'pos' + di" class="pos-zone">
          <div class="zone-label red-label">
            {{ d.label }}<span class="dim" style="font-size: 11px">（{{ playType === 'duplex' ? '可多选，多选即定位复式' : '每位选 1 个' }}）</span>
          </div>
          <div class="ball-pool">
            <button
              v-for="v in (d.max + 1)"
              :key="'p' + di + '_' + v"
              class="pool-btn"
              :class="{ picked: posSel[di] && posSel[di].includes(v - 1), 'btn-red': true }"
              @click="togglePos(di, v - 1)"
            >{{ v - 1 }}</button>
          </div>
        </div>
        <template v-if="cfg.tail != null && cfg.tail !== undefined">
          <div class="zone-label blue-label">尾位（0~{{ cfg.tailMax }}）</div>
          <div class="ball-pool">
            <button
              v-for="v in (cfg.tailMax + 1)"
              :key="'tail' + v"
              class="pool-btn"
              :class="{ picked: tailSel.includes(v - 1), 'btn-blue': true }"
              @click="toggleTail(v - 1)"
            >{{ v - 1 }}</button>
          </div>
        </template>
      </template>
      <template v-if="playType === 'danTuo'">
        <div class="zone-label red-label">红球胆码（选 1~{{ cfg.redCount - 1 }} 个，每注必含）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'dan' + n"
            class="pool-btn"
            :class="{ picked: danSel.includes(n), 'btn-red': true }"
            :disabled="danSel.includes(n) ? false : danSel.length >= cfg.redCount - 1"
            @click="toggleIn('dan', n)"
          >{{ pad2(n) }}</button>
        </div>
        <div class="zone-label amber-label">红球拖码（至少选 {{ Math.max(1, cfg.redCount - danSel.length) }} 个）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'tuo' + n"
            class="pool-btn"
            :class="{ picked: tuoSel.includes(n), 'btn-amber': true }"
            :disabled="danSel.includes(n) || (tuoSel.includes(n) ? false : tuoSel.length >= cfg.redMax - danSel.length)"
            @click="toggleIn('tuo', n)"
          >{{ pad2(n) }}</button>
        </div>
      </template>
      <template v-else-if="!isDirect">
        <div class="zone-label red-label">{{ redLabel }}</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'r' + n"
            class="pool-btn"
            :class="{ picked: redSel.includes(n), 'btn-red': true }"
            :disabled="redSel.includes(n) ? false : redSel.length >= redLimit"
            @click="toggleIn('red', n)"
          >{{ pad2(n) }}</button>
        </div>
      </template>

      <div v-if="!isDirect" class="zone-label blue-label">{{ blueLabel }}</div>
      <div v-if="!isDirect" class="ball-pool">
        <button
          v-for="n in cfg.blueMax"
          :key="'b' + n"
          class="pool-btn"
          :class="{ picked: blueSel.includes(n), 'btn-blue': true }"
          :disabled="blueSel.includes(n) ? false : blueSel.length >= blueLimit"
          @click="toggleIn('blue', n)"
        >{{ pad2(n) }}</button>
      </div>

      <div v-if="playType === 'multi'" class="multi-draft">
        <div class="multi-tools">
          <el-button size="small" @click="randomPick">随机选号</el-button>
          <el-button size="small" type="primary" plain @click="aiFill">AI 补齐入票</el-button>
          <el-button size="small" @click="clearSel">清空选区</el-button>
          <el-button size="small" type="primary" :disabled="!singleComplete" @click="addToDraft">加入票中（已 {{ draft.length }} 注）</el-button>
          <el-button size="small" text @click="draft = []">清空票</el-button>
        </div>
        <div v-if="draft.length" class="draft-list">
          <div v-for="(d, i) in draft" :key="i" class="draft-item">
            <span class="dim" style="width: 22px">{{ i + 1 }}</span>
            <span class="ticket-balls">
              <template v-if="d.digits">
                <span v-for="(dv, di) in d.digits" :key="'d' + di" class="ball ball-red" style="width: 24px; height: 24px; font-size: 11px">{{ dv }}</span>
                <span v-if="d.tail != null" class="ball ball-blue" style="width: 24px; height: 24px; font-size: 11px">{{ d.tail }}</span>
              </template>
              <template v-else>
                <span v-for="n in d.red" :key="'r' + n" class="ball ball-red" style="width: 24px; height: 24px; font-size: 11px">{{ pad2(n) }}</span>
                <span v-for="(b, bi) in d.blue" :key="'b' + bi" class="ball ball-blue" style="width: 24px; height: 24px; font-size: 11px">{{ pad2(b) }}</span>
              </template>
            </span>
            <span class="dim" style="font-size: 12px">¥2</span>
            <el-button size="small" text type="danger" @click="draft.splice(i, 1)">移除</el-button>
          </div>
        </div>
      </div>

      <div class="pick-actions">
        <template v-if="playType !== 'multi'">
          <el-button size="small" @click="randomPick">随机选号</el-button>
          <el-button size="small" type="primary" plain @click="aiFill">AI 补齐剩余</el-button>
          <el-button size="small" type="danger" plain @click="clearSel">清空</el-button>
          <el-button size="small" type="primary" :disabled="!canSave" @click="savePick">保存本票</el-button>
        </template>
        <template v-else>
          <el-button size="small" type="primary" :disabled="!draft.length" @click="savePick">保存多注票（{{ draft.length }} 注）</el-button>
          <el-button size="small" type="danger" plain @click="clearSel">清空选区</el-button>
        </template>
        <span class="dim" style="font-size: 12px">可只自定义部分号码，剩余由 AI 算法补齐（与 AI 选号逻辑一致）</span>
        <span v-if="liveInfo" class="live-score">
          <template v-if="liveInfo.partial">
            <span class="dim" style="font-size: 12px">已自定义部分号码，点击「AI 补齐剩余」或直接保存（自动补齐）</span>
          </template>
          <template v-else-if="liveInfo.total > 0">
            <div class="live-card">
              <div class="live-head">
                <span class="live-total">{{ liveInfo.total }}</span>
                <span class="live-total-label">综合得分</span>
                <span v-if="liveInfo.count > 1" class="dim">平均 · 最高 {{ liveInfo.max }} · 最低 {{ liveInfo.min }} · 共 {{ liveInfo.count }} 注</span>
                <span v-else class="dim">当前组合评分</span>
                <span v-if="liveInfo.amount > 0" class="amount-pill">共 {{ liveInfo.combos }} 注 · ¥{{ liveInfo.amount }}</span>
              </div>
              <div v-if="liveInfo.items.length" class="score-bars">
                <div class="score-bar" v-for="item in liveInfo.items" :key="item.label">
                  <span class="score-label">{{ item.label }}</span>
                  <span class="score-track"><span class="score-fill" :style="{ width: item.value + '%' }"></span></span>
                  <span class="score-num">{{ Math.round(item.value) }}</span>
                </div>
              </div>
            </div>
          </template>
          <template v-else class="dim">等待选号评分…</template>
        </span>
      </div>
    </div>

    <div class="saved-head">
      <span class="dim">已保存 {{ picks.length }} 张票</span>
      <span class="dim" v-if="latest">自动追溯最近 {{ props.draws.length }} 期开奖核对，无需手动选期</span>
      <el-button size="small" text @click="recheckAll">重新核对</el-button>
      <el-button size="small" text type="danger" @click="clearAll">清空全部</el-button>
    </div>

    <div v-if="!picks.length" class="empty-tip">还没有保存的自选号码。选择玩法并选号后点「保存本票」，软件会记录评分与金额，并在每次打开时自动追溯最近开奖核对中奖情况。</div>

    <div v-for="p in picks" :key="p.id" class="pick-row" :class="{ won: p.prize && p.prize.level > 0, pending: p.status === 'pending' }">
      <div class="pick-main">
        <div class="pick-balls" v-if="p.ticket.type === 'single'">
          <template v-if="p.ticket.digits">
            <el-tag v-if="p.ticket.zx && p.ticket.zx !== 'direct'" size="small" type="warning" style="margin-right: 6px">{{ zxLabel(p.ticket.zx) }}</el-tag>
            <span v-for="(dv, di) in p.ticket.digits" :key="'d' + di" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ dv }}</span>
            <span v-if="p.ticket.tail != null" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ p.ticket.tail }}</span>
          </template>
          <template v-else>
            <span v-for="n in p.ticket.red" :key="'r' + n" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(n) }}</span>
            <span v-for="(b, i) in p.ticket.blue" :key="'b' + i" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(b) }}</span>
          </template>
        </div>
        <div v-else-if="p.ticket.type === 'multi'" class="pick-multi">
          <el-tag size="small" type="warning" style="margin-right: 8px">多注 ×{{ p.ticket.tickets.length }}</el-tag>
          <div class="multi-balls">
            <div v-for="(t, i) in p.ticket.tickets" :key="i" class="mini-line">
              <span class="dim" style="width: 18px; font-size: 11px">{{ i + 1 }}</span>
              <template v-if="t.digits">
                <span v-for="(dv, di) in t.digits" :key="'d' + di" class="ball ball-red" style="width: 22px; height: 22px; font-size: 10px">{{ dv }}</span>
                <span v-if="t.tail != null" class="ball ball-blue" style="width: 22px; height: 22px; font-size: 10px">{{ t.tail }}</span>
              </template>
              <template v-else>
                <span v-for="n in t.red" :key="'r' + n" class="ball ball-red" style="width: 22px; height: 22px; font-size: 10px">{{ pad2(n) }}</span>
                <span v-for="(b, bi) in t.blue" :key="'b' + bi" class="ball ball-blue" style="width: 22px; height: 22px; font-size: 10px">{{ pad2(b) }}</span>
              </template>
            </div>
          </div>
        </div>
        <div v-else-if="p.ticket.type === 'duplex' && p.ticket.digits" class="pick-balls">
          <el-tag size="small" type="success" style="margin-right: 8px">定位复式</el-tag>
          <span v-for="(ds, di) in p.ticket.digits" :key="'ds' + di" class="pos-group">
            <span class="dim" style="font-size: 11px">{{ p.ticket.posLabels ? p.ticket.posLabels[di] : '位' + (di + 1) }}:</span>
            <span v-for="dv in ds" :key="'v' + dv" class="ball ball-red" style="width: 22px; height: 22px; font-size: 11px">{{ dv }}</span>
          </span>
          <span v-if="p.ticket.tail != null && p.ticket.tail.length" class="pos-group">
            <span class="dim" style="font-size: 11px">尾:</span>
            <span v-for="tv in p.ticket.tail" :key="'tv' + tv" class="ball ball-blue" style="width: 22px; height: 22px; font-size: 11px">{{ tv }}</span>
          </span>
        </div>
        <div v-else class="pick-balls">
          <el-tag size="small" :type="p.ticket.type === 'duplex' ? 'success' : 'primary'" style="margin-right: 8px">
            {{ p.ticket.type === 'duplex' ? '复式' : '胆拖' }}
          </el-tag>
          <template v-if="p.ticket.type === 'duplex'">
            <span v-for="n in p.ticket.red" :key="'r' + n" class="ball ball-red" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(n) }}</span>
            <span v-for="(b, i) in p.ticket.blue" :key="'b' + i" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(b) }}</span>
          </template>
          <template v-else>
            <span v-for="n in p.ticket.danRed" :key="'d' + n" class="ball ball-amber" style="width: 26px; height: 26px; font-size: 12px" :title="'胆码 ' + pad2(n)">{{ pad2(n) }}</span>
            <span v-for="n in p.ticket.tuoRed" :key="'t' + n" class="ball ball-red-soft" style="width: 26px; height: 26px; font-size: 12px" :title="'拖码 ' + pad2(n)">{{ pad2(n) }}</span>
            <span v-for="(b, i) in p.ticket.blue" :key="'b' + i" class="ball ball-blue" style="width: 26px; height: 26px; font-size: 12px">{{ pad2(b) }}</span>
          </template>
        </div>
      </div>
      <div class="pick-meta">
        <div class="pick-score dim">
          评分 {{ p.score ? p.score.total : '—' }}
          <span v-if="p.score && p.score.count > 1" class="dim">（{{ p.score.min }}~{{ p.score.max }}）</span>
        </div>
        <div v-if="p.score && p.score.lines && p.score.lines.length" class="mini-bars">
          <div v-for="item in scoreItems(p.score.lines[0].score)" :key="item.label" class="mini-bar">
            <span class="mini-label">{{ item.label }}</span>
            <span class="mini-track"><span class="mini-fill" :style="{ width: item.value + '%' }"></span></span>
            <span class="mini-num">{{ Math.round(item.value) }}</span>
          </div>
        </div>
        <div class="dim" style="font-size: 12px">{{ p.combos }} 注 · ¥{{ p.amount }}<span v-if="p.ticket && p.ticket.append">（追加）</span></div>
        <div class="pick-stamp" :title="'生成时间戳 ' + (p.createStamp || p.savedAt || '')">生成于 {{ fmtStamp(p.createStamp || p.savedAt) }}</div>
      </div>
      <div class="pick-result">
        <template v-if="p.status === 'pending'">
          <span class="status-pill pending">未开奖</span>
          <span class="dim" style="font-size: 12px">等待第 {{ p.checkedIssue }} 期开奖结果</span>
        </template>
        <template v-else-if="p.prize">
          <span v-if="p.prize.level > 0" class="prize-badge" :class="'lv' + p.prize.level">
            {{ p.prize.name }} · ¥{{ fmtBonus(p.prize.bonus) }}
            <span v-if="p.prize.winCount > 1">（{{ p.prize.winCount }} 注中奖）</span>
          </span>
          <span v-else class="dim">未中奖</span>
          <span v-if="p.prize.draw" class="dim" style="font-size: 12px">第 {{ p.prize.draw.issue }} 期 · {{ fmtDate(p.prize.draw.date) }}</span>
          <el-button v-if="p.prize.level > 0" size="small" text type="primary" @click="showFlow(p)">兑奖流程</el-button>
          <div v-if="p.hitCount > 0" class="hit-strip">
            <div class="hit-summary">
              <span class="hit-total">历史 {{ p.hitCount }} 期中奖 · 奖金总额 ¥{{ fmtBonus(p.totalBonus) }}</span>
              <el-button size="small" text type="primary" @click="toggleHits(p)">{{ p._hitsExpanded ? '收起' : '明细' }}</el-button>
            </div>
            <div v-if="p._hitsExpanded" class="hit-list">
              <div v-for="(h, hi) in p.hits" :key="hi" class="hit-chip" :class="'lv' + h.level">
                <span class="hc-issue">{{ h.issue }}期</span>
                <span class="hc-name">{{ h.name }}</span>
                <span class="hc-bonus">¥{{ fmtBonus(h.bonus) }}</span>
                <span v-if="h.provinceText && h.provinceText !== '—'" class="hc-prov">{{ h.provinceText }}</span>
              </div>
            </div>
          </div>
        </template>
        <span v-else class="dim">等待核对…</span>
      </div>
      <div class="pick-del">
        <el-button size="small" text type="danger" @click="removePick(p.id)">删除</el-button>
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
        </div>
        <template v-if="flowData.steps.length">
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
        <div v-if="flowData.note && !flowData.isBig" class="pf-note">{{ flowData.note }}</div>
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
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { pad2, fmtDate, fmtStamp } from '../utils/game-config'
import { scoreTicketPlay, calcPlay, createPickerEngine, PLAY_TYPES, calcDirectPlay, computeDirectStats, scoreDigits, scoreItemsFor } from '../utils/picker-engine'
import { checkTicketHistory, checkTicketHistoryMulti, isBigWin, bigWinFlow, smallWinNote, fmtBonus } from '../utils/prize-check'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const engine = createPickerEngine(props.cfg)

const isDirect = computed(() => props.cfg.playMode === 'direct')

const playType = ref('single')
const append = ref(false)
const redSel = ref([])
const blueSel = ref([])
const danSel = ref([])
const tuoSel = ref([])
// 直位：当前组选形态（direct/zuxuan3/zuxuan6）与每位定位选择
const zxType = ref('direct')
const posSel = ref([])
const tailSel = ref([])
const canZx = computed(() => Array.isArray(props.cfg.directTypes) && props.cfg.directTypes.includes('zuxuan3'))
// 用户手动自定义的号码（AI 补齐只锁定这些，AI 补的号可反复重新生成）
const userRed = ref([])
const userBlue = ref([])
const userDan = ref([])
const userTuo = ref([])
const draft = ref([])
const picks = ref([])
const flowVisible = ref(false)
const flowData = ref(null)

const STORE_KEY = () => 'lottery-picker-mypicks-' + props.cfg.key

const latest = computed(() => (props.draws && props.draws.length ? props.draws[0] : null))

const redLabel = computed(() => (playType.value === 'duplex' ? `红球区（复式选 ≥${props.cfg.redCount} 个）` : `红球区（选 ${props.cfg.redCount} 个）`))
const blueLabel = computed(() => {
  if (playType.value === 'duplex') return `蓝球区（选 ≥${props.cfg.blueCount} 个）`
  if (playType.value === 'danTuo') return `蓝球区（选 ≥${props.cfg.blueCount} 个，多选即复式胆拖）`
  return `蓝球区（选 ${props.cfg.blueCount} 个）`
})
const redLimit = computed(() => (playType.value === 'duplex' ? props.cfg.redMax : props.cfg.redCount))
const blueLimit = computed(() => {
  if (playType.value === 'duplex') return props.cfg.blueMax
  if (playType.value === 'danTuo') return props.cfg.blueMax
  return props.cfg.blueCount
})

const playHint = computed(() => {
  if (isDirect.value) {
    const map = {
      single: zxType.value === 'direct' ? '每位选 1 个数字，顺序即开奖顺序；可选组选3/组选6' : '选择 3 个数字按' + (zxType.value === 'zuxuan3' ? '组选3（含对子）' : '组选6（三不同）') + '投注',
      multi: '逐注加入票中，可组合多注同时购买',
      duplex: '每位可多选数字，自动组合全部单注（定位复式）'
    }
    return map[playType.value]
  }
  const map = {
    single: '选择一注完整号码后保存，1 注 2 元',
    multi: '逐注加入票中，可组合多注同时购买',
    duplex: '红蓝球多选，自动组合成全部单注（复式）',
    danTuo: '先选胆码（每注必含），再选拖码自动组合；蓝球可多选（官方复式胆拖）'
  }
  return map[playType.value]
})

function toggleIn(zone, n) {
  const toggle = (list) => (list.value.includes(n) ? list.value.filter((x) => x !== n) : [...list.value, n].sort((a, b) => a - b))
  if (zone === 'dan') {
    danSel.value = danSel.value.includes(n) ? danSel.value.filter((x) => x !== n) : [...danSel.value, n].sort((a, b) => a - b)
    userDan.value = toggle(userDan)
  } else if (zone === 'tuo') {
    if (tuoSel.value.includes(n)) {
      tuoSel.value = tuoSel.value.filter((x) => x !== n)
      userTuo.value = userTuo.value.filter((x) => x !== n)
    } else if (tuoSel.value.length < props.cfg.redMax - danSel.value.length) {
      tuoSel.value = [...tuoSel.value, n].sort((a, b) => a - b)
      userTuo.value = toggle(userTuo)
    }
  } else if (zone === 'red') {
    if (redSel.value.includes(n)) {
      redSel.value = redSel.value.filter((x) => x !== n)
      userRed.value = userRed.value.filter((x) => x !== n)
    } else if (redSel.value.length < redLimit.value) {
      redSel.value = [...redSel.value, n].sort((a, b) => a - b)
      userRed.value = toggle(userRed)
    }
  } else {
    if (blueSel.value.includes(n)) {
      blueSel.value = blueSel.value.filter((x) => x !== n)
      userBlue.value = userBlue.value.filter((x) => x !== n)
    } else if (blueSel.value.length < blueLimit.value) {
      blueSel.value = [...blueSel.value, n].sort((a, b) => a - b)
      userBlue.value = toggle(userBlue)
    }
  }
}

function togglePos(di, v) {
  const cur = posSel.value[di] || []
  if (playType.value === 'single' || playType.value === 'multi') {
    // 单注/多注每位只选 1 个；重复点击取消
    posSel.value[di] = cur.includes(v) ? [] : [v]
  } else {
    posSel.value[di] = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((a, b) => a - b)
  }
  posSel.value = [...posSel.value]
}

function toggleTail(v) {
  if (playType.value === 'single' || playType.value === 'multi') {
    tailSel.value = tailSel.value.includes(v) ? [] : [v]
  } else {
    tailSel.value = tailSel.value.includes(v) ? tailSel.value.filter((x) => x !== v) : [...tailSel.value, v].sort((a, b) => a - b)
  }
}

/** 当前选区构造成票（multi 玩法下只用于单注选区判断） */
function currentTicket() {
  const base = { append: append.value && props.cfg.zhuijia }
  if (isDirect.value) {
    if (playType.value === 'single') {
      const ticket = { type: 'single', digits: posSel.value.map((p) => (p && p.length ? p[0] : null)), ...base }
      if (props.cfg.tail != null) ticket.tail = tailSel.value.length ? tailSel.value[0] : null
      if (canZx.value && zxType.value !== 'direct') ticket.zx = zxType.value
      return ticket
    }
    if (playType.value === 'duplex') {
      const ticket = { type: 'duplex', digits: posSel.value.map((p) => [...(p || [])]), ...base }
      if (props.cfg.tail != null) ticket.tail = [...tailSel.value]
      return ticket
    }
    return { type: 'multi', tickets: draft.value.map((d) => ({ digits: [...d.digits], tail: d.tail != null ? d.tail : undefined })), ...base }
  }
  if (playType.value === 'single') return { type: 'single', red: [...redSel.value], blue: [...blueSel.value], ...base }
  if (playType.value === 'duplex') return { type: 'duplex', red: [...redSel.value], blue: [...blueSel.value], ...base }
  if (playType.value === 'danTuo') return { type: 'danTuo', danRed: [...danSel.value], tuoRed: [...tuoSel.value], blue: [...blueSel.value], ...base }
  return { type: 'multi', tickets: draft.value.map((d) => ({ red: [...d.red], blue: [...d.blue] })), ...base }
}

const singleComplete = computed(() => {
  if (isDirect.value) {
    if (playType.value === 'multi') return false
    if (playType.value === 'duplex') return true
    const need = props.cfg.digits.length
    const filled = posSel.value.filter((p) => p && p.length === 1).length
    const tailOk = props.cfg.tail != null ? tailSel.value.length === 1 : true
    return filled === need && tailOk
  }
  return redSel.value.length === props.cfg.redCount && blueSel.value.length === props.cfg.blueCount
})

/** 是否已自定义至少一个号码（红或蓝），AI 负责补齐剩余 */
const hasLocked = computed(() => {
  if (isDirect.value) {
    if (playType.value === 'multi') return draft.value.length > 0
    return posSel.value.some((p) => p && p.length > 0) || (props.cfg.tail != null && tailSel.value.length > 0)
  }
  if (playType.value === 'danTuo') return userDan.value.length > 0 || userBlue.value.length > 0
  return userRed.value.length > 0 || userBlue.value.length > 0
})

const canSave = computed(() => {
  if (isDirect.value) {
    if (playType.value === 'multi') return draft.value.length > 0 || hasLocked.value
    return hasLocked.value
  }
  if (playType.value === 'multi') return draft.value.length > 0 || hasLocked.value
  // 单注/复式/胆拖：只要自定义了号码即可保存，缺的由 AI 补齐
  return hasLocked.value
})

/** 当前票是否已选完整（不需要 AI 补齐） */
function needsFill() {
  if (isDirect.value) {
    if (playType.value === 'duplex') return false
    if (playType.value === 'multi') return draft.value.length === 0
    // 单注：每位都选满才完整（含组选 3 个数字）
    const need = props.cfg.digits.length
    const filled = posSel.value.filter((p) => p && p.length === 1).length
    const tailOk = props.cfg.tail != null ? tailSel.value.length === 1 : true
    return filled !== need || !tailOk
  }
  if (playType.value === 'single') return redSel.value.length !== props.cfg.redCount || blueSel.value.length !== props.cfg.blueCount
  if (playType.value === 'duplex') return redSel.value.length < props.cfg.redCount || blueSel.value.length < props.cfg.blueCount
  if (playType.value === 'danTuo') {
    const dan = danSel.value.length
    return !(dan >= 1 && dan <= props.cfg.redCount - 1 && tuoSel.value.length >= props.cfg.redCount - dan && blueSel.value.length >= props.cfg.blueCount)
  }
  return draft.value.length === 0
}

/**
 * AI 补齐剩余号码：用户自定义部分号码（也可只选一个），
 * 其余由 picker-engine 按冷热/区间等策略生成，填入选区供确认后保存。
 */
function aiFill() {
  if (isDirect.value) {
    if (playType.value === 'multi') {
      const digits = props.cfg.digits.map(() => randInt(0, 9))
      const tail = props.cfg.tail != null ? randInt(0, props.cfg.tailMax) : undefined
      draft.value = [...draft.value, { digits, tail }]
      clearSel()
      ElMessage.success('AI 已生成一注并加入票中')
      return
    }
    // 单注：补齐未选位
    props.cfg.digits.forEach((d, di) => {
      if (!posSel.value[di] || !posSel.value[di].length) posSel.value[di] = [randInt(0, d.max)]
    })
    if (props.cfg.tail != null && !tailSel.value.length) tailSel.value = [randInt(0, props.cfg.tailMax)]
    posSel.value = [...posSel.value]
    ElMessage.success('AI 已补齐剩余号码，不满意可再次点击重新生成')
    return
  }

  if (playType.value === 'multi') {
    if (!userRed.value.length && !userBlue.value.length) {
      ElMessage.warning('请先自定义至少一个号码，再让 AI 补齐一注')
      return
    }
    const r = engine.generatePlay(props.draws, { type: 'single', locked: { red: userRed.value, blue: userBlue.value } })
    draft.value = [...draft.value, { red: r.ticket.red, blue: r.ticket.blue }]
    clearSel()
    ElMessage.success('AI 已补齐一注并加入票中')
    return
  }

  if (playType.value === 'danTuo') {
    // 用户自定义红球全部作为胆码（与彩票店胆拖一致）
    const danN = Math.max(1, userDan.value.length)
    const tuoN = Math.max(props.cfg.redCount - danN, userTuo.value.length)
    const blueCount = Math.max(props.cfg.blueCount, userBlue.value.length)
    const r = engine.generatePlay(props.draws, { type: 'danTuo', danN, tuoN, blueCount, locked: { red: userDan.value, blue: userBlue.value } })
    // 用户自选的拖码与 AI 拖码合并，保证都在且互斥
    let tuo = [...new Set([...userTuo.value, ...r.ticket.tuoRed])]
      .filter((n) => !r.ticket.danRed.includes(n))
      .sort((a, b) => a - b)
    if (tuo.length > props.cfg.redMax - r.ticket.danRed.length) tuo = tuo.slice(0, props.cfg.redMax - r.ticket.danRed.length)
    danSel.value = r.ticket.danRed
    tuoSel.value = tuo
    blueSel.value = r.ticket.blue
  } else if (playType.value === 'duplex') {
    // 复式：用户已选的并入复式集合，AI 补齐到至少基本注数
    const redCount = Math.max(props.cfg.redCount, userRed.value.length)
    const blueCount = Math.max(props.cfg.blueCount, userBlue.value.length)
    const r = engine.generatePlay(props.draws, { type: 'duplex', redCount, blueCount, locked: { red: userRed.value, blue: userBlue.value } })
    redSel.value = r.ticket.red
    blueSel.value = r.ticket.blue
  } else {
    const r = engine.generatePlay(props.draws, { type: 'single', locked: { red: userRed.value, blue: userBlue.value } })
    redSel.value = r.ticket.red
    blueSel.value = r.ticket.blue
  }
  ElMessage.success('AI 已补齐剩余号码，不满意可再次点击重新生成')
}

const liveInfo = computed(() => {
  // 未选完整时（部分自定义待 AI 补齐），不评分只提示
  const partial = needsFill() && playType.value !== 'multi'
  if (partial) {
    return { partial: true, total: 0, max: 0, min: 0, count: 0, combos: 0, amount: 0, items: [] }
  }
  const ticket = currentTicket()
  if (isDirect.value) {
    const calc = calcDirectPlay(props.cfg, ticket)
    if (!calc.combos) return null
    const stats = computeDirectStats(props.cfg, props.draws, ticket)
    return {
      total: stats ? stats.total : 0,
      max: stats ? stats.max : 0,
      min: stats ? stats.min : 0,
      count: stats ? stats.count : 0,
      combos: calc.combos,
      amount: calc.amount,
      items: []
    }
  }
  const calc = calcPlay(props.cfg, ticket)
  if (!calc.combos) return null
  const scored = scoreTicketPlay(props.cfg, props.draws, ticket)
  const first = scored.lines && scored.lines.length ? scored.lines[0].score : null
  return {
    total: scored.total,
    max: scored.max,
    min: scored.min,
    count: scored.count,
    combos: calc.combos,
    amount: calc.amount,
    items: first ? scoreItems(first) : []
  }
})

function scoreItems(score) {
  // 按当前彩种推荐策略动态生成评分条；兼容旧版本地数据（缺失字段兜底为 0，避免 NaN）
  return scoreItemsFor(props.cfg, score)
}

function randomPick() {
  if (isDirect.value) {
    if (playType.value === 'multi') {
      const digits = props.cfg.digits.map(() => randInt(0, 9))
      const tail = props.cfg.tail != null ? randInt(0, props.cfg.tailMax) : undefined
      draft.value = [...draft.value, { digits, tail }]
      return
    }
    posSel.value = props.cfg.digits.map((d) => [randInt(0, d.max)])
    if (props.cfg.tail != null) tailSel.value = [randInt(0, props.cfg.tailMax)]
    return
  }
  userRed.value = []
  userBlue.value = []
  userDan.value = []
  userTuo.value = []
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
  const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
  const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
  if (playType.value === 'duplex') {
    const r = Math.min(props.cfg.redMax, props.cfg.redCount + randInt(1, Math.min(4, props.cfg.redMax - props.cfg.redCount)))
    const b = Math.min(props.cfg.blueMax, props.cfg.blueCount + (props.cfg.blueCount === 1 ? randInt(0, 1) : randInt(0, 2)))
    redSel.value = shuffle(pool).slice(0, r).sort((a, b) => a - b)
    blueSel.value = shuffle(bpool).slice(0, Math.max(props.cfg.blueCount, b)).sort((a, b) => a - b)
  } else if (playType.value === 'danTuo') {
    const danN = randInt(1, props.cfg.redCount - 1)
    danSel.value = shuffle(pool).slice(0, danN).sort((a, b) => a - b)
    const rest = pool.filter((n) => !danSel.value.includes(n))
    const tuoN = randInt(props.cfg.redCount - danN, Math.min(props.cfg.redCount - danN + 3, rest.length))
    tuoSel.value = shuffle(rest).slice(0, tuoN).sort((a, b) => a - b)
    blueSel.value = shuffle(bpool).slice(0, props.cfg.blueCount).sort((a, b) => a - b)
  } else {
    redSel.value = shuffle(pool).slice(0, props.cfg.redCount).sort((a, b) => a - b)
    blueSel.value = shuffle(bpool).slice(0, props.cfg.blueCount).sort((a, b) => a - b)
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function clearSel() {
  posSel.value = []
  tailSel.value = []
  redSel.value = []
  blueSel.value = []
  danSel.value = []
  tuoSel.value = []
  userRed.value = []
  userBlue.value = []
  userDan.value = []
  userTuo.value = []
}

function addToDraft() {
  if (!singleComplete.value) return
  if (isDirect.value) {
    draft.value = [...draft.value, { digits: posSel.value.map((p) => p[0]), tail: props.cfg.tail != null ? tailSel.value[0] : undefined }]
  } else {
    draft.value = [...draft.value, { red: [...redSel.value], blue: [...blueSel.value] }]
  }
  clearSel()
}

/** 组选形态展示名 */
function zxLabel(zx) {
  if (zx === 'zuxuan3') return '组选3'
  if (zx === 'zuxuan6') return '组选6'
  return '直选'
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

function savePick() {
  if (!canSave.value) return
  // 未选完整时自动用 AI 补齐，保证保存的是完整票
  if (needsFill()) aiFill()
  const ticket = currentTicket()
  const calc = isDirect.value ? calcDirectPlay(props.cfg, ticket) : calcPlay(props.cfg, ticket)
  let score
  if (isDirect.value) {
    const stats = computeDirectStats(props.cfg, props.draws, ticket)
    score = stats ? { total: stats.total, max: stats.max, min: stats.min, count: stats.count, lines: [] } : { total: 0, max: 0, min: 0, count: 0, lines: [] }
  } else {
    score = scoreTicketPlay(props.cfg, props.draws, ticket)
  }
  const checked = props.draws && props.draws.length ? checkTicketHistory(props.cfg, ticket, props.draws) : null
  const hitIssue = checked && checked.draw ? checked.draw.issue : null
  const multi = props.draws && props.draws.length ? checkTicketHistoryMulti(props.cfg, ticket, props.draws) : { hits: [], hitCount: 0, totalBonus: 0 }
  const pick = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createStamp: Date.now(), // 生成时间戳：保存时写入，唯一且不可更改，仅用于展示
    ticket,
    savedAt: Date.now(),
    combos: calc.combos,
    amount: calc.amount,
    score: { total: score.total, max: score.max, min: score.min, count: score.count, lines: score.lines || [] },
    checkedIssue: hitIssue || (latest.value ? latest.value.issue : null),
    status: latest.value ? 'checked' : 'pending',
    prize: checked,
    hits: multi.hits,
    hitCount: multi.hitCount,
    totalBonus: multi.totalBonus,
    _hitsExpanded: false
  }
  picks.value = [pick, ...picks.value]
  persist()
  clearSel()
  draft.value = []
  if (pick.prize && isBigWin(pick.prize.best)) {
    promptFlowIfNew(pick)
  }
}

function removePick(id) {
  const p = picks.value.find((x) => x.id === id)
  if (!p) return
  ElMessageBox.confirm('确定删除这张自选号码吗？删除后不可恢复。', '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      picks.value = picks.value.filter((x) => x.id !== id)
      persist()
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

function clearAll() {
  if (!picks.value.length) return
  ElMessageBox.confirm(`确定清空全部 ${picks.value.length} 张自选号码吗？删除后不可恢复。`, '清空确认', {
    confirmButtonText: '全部删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      picks.value = []
      persist()
      ElMessage.success('已清空')
    })
    .catch(() => {})
}

/** 展开/收起某张票的多期中奖明细 */
function toggleHits(p) {
  p._hitsExpanded = !p._hitsExpanded
}

function recheckAll() {
  if (!latest.value) return
  picks.value = picks.value.map((p) => {
    const checked = checkTicketHistory(props.cfg, p.ticket, props.draws)
    const multi = checkTicketHistoryMulti(props.cfg, p.ticket, props.draws)
    return { ...p, checkedIssue: checked && checked.draw ? checked.draw.issue : null, status: 'checked', prize: checked, hits: multi.hits, hitCount: multi.hitCount, totalBonus: multi.totalBonus }
  })
  persist()
  // 只对"未提示过"的中大奖弹一次窗；多条未提示时弹第一条，其余一并标记已提示（列表仍可见奖级）
  const bigs = picks.value.filter((p) => p.prize && isBigWin(p.prize.best))
  const fresh = bigs.filter((p) => !shownFlowIds.value.has(flowKey(p)))
  if (fresh.length) {
    const first = fresh[0]
    flowData.value = buildFlowData(first.prize.best, bigWinFlow(props.cfg, first.prize.best))
    flowVisible.value = true
    fresh.forEach((p) => markShown(p))
  }
}

function showFlow(p) {
  const pr = p.prize && p.prize.best ? p.prize.best : p.prize
  flowData.value = buildFlowData(pr, isBigWin(pr) ? bigWinFlow(props.cfg, pr) : smallWinNote(props.cfg, pr))
  flowVisible.value = true
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY(), JSON.stringify(picks.value))
  } catch (e) {
    console.error('保存自选号失败', e)
  }
}

const FLOW_SHOWN_KEY = () => 'lottery-picker-flow-shown-' + props.cfg.key
const shownFlowIds = ref(new Set())

/** 弹窗去重键：票 id + 核对期次 + 奖级，同一中奖记录只提示一次 */
function flowKey(p) {
  const pr = p.prize && p.prize.best ? p.prize.best : p.prize
  const issue = pr && pr.draw ? pr.draw.issue : p.checkedIssue || ''
  return `${p.id}-${issue}-${pr ? pr.level : 0}`
}

function loadShown() {
  try {
    const raw = localStorage.getItem(FLOW_SHOWN_KEY())
    shownFlowIds.value = new Set(raw ? JSON.parse(raw) : [])
  } catch (e) {
    shownFlowIds.value = new Set()
  }
}

function persistShown() {
  try {
    localStorage.setItem(FLOW_SHOWN_KEY(), JSON.stringify([...shownFlowIds.value]))
  } catch (e) {
    console.error('保存中奖提示记录失败', e)
  }
}

function markShown(p) {
  shownFlowIds.value.add(flowKey(p))
  persistShown()
}

/** 中大奖时弹兑奖窗，但同一中奖记录只弹一次 */
function promptFlowIfNew(p) {
  const pr = p.prize && p.prize.best ? p.prize.best : p.prize
  if (!pr) return
  if (shownFlowIds.value.has(flowKey(p))) return
  flowData.value = buildFlowData(pr, isBigWin(pr) ? bigWinFlow(props.cfg, pr) : smallWinNote(props.cfg, pr))
  flowVisible.value = true
  markShown(p)
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY())
    const arr = raw ? JSON.parse(raw) : []
    picks.value = arr.map((p) => {
      // 兼容旧格式：无 ticket 字段视为单注
      if (!p.ticket) {
        return {
          ...p,
          ticket: { type: 'single', red: p.red || [], blue: p.blue || [] },
          combos: 1,
          amount: 2
        }
      }
      return p
    })
  } catch (e) {
    picks.value = []
  }
}

watch(() => props.draws, () => {
  if (props.draws && props.draws.length) recheckAll()
})

onMounted(() => {
  load()
  loadShown()
  if (props.draws && props.draws.length) recheckAll()
})
</script>

<style scoped>
.play-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.pick-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  padding: 16px;
  margin-bottom: 14px;
}

.zone-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.red-label {
  color: var(--red);
}

.amber-label {
  color: var(--amber);
  margin-top: 14px;
}

.blue-label {
  color: var(--blue);
  margin-top: 14px;
}

.ball-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pool-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  font-weight: 600;
}

.pool-btn:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.btn-red.picked {
  background: radial-gradient(circle at 32% 28%, #ff9a8a, #d92b3f 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(217, 43, 63, 0.5);
}

.btn-amber.picked {
  background: radial-gradient(circle at 32% 28%, #ffd54f, #f57c00 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(245, 124, 0, 0.5);
}

.btn-blue.picked {
  background: radial-gradient(circle at 32% 28%, #8fc0ff, #1d5ad4 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(29, 90, 212, 0.5);
}

.pick-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.live-score {
  margin-left: auto;
  font-size: 13px;
}

.live-card {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--card-bg);
  padding: 10px 14px;
  min-width: 260px;
}

.live-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.live-total {
  font-size: 26px;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
}

.live-total-label {
  font-size: 13px;
  color: var(--text-dim);
}

.score-bars {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.score-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.score-label {
  width: 40px;
  color: var(--text-dim);
}

.score-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--border-light);
  overflow: hidden;
}

.score-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #ff6f5e, #f6c453);
}

.score-num {
  width: 32px;
  text-align: right;
  color: var(--text-dim);
}

.mini-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 4px 0;
}

.mini-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.mini-label {
  width: 30px;
  color: var(--text-dim);
}

.mini-track {
  flex: 1;
  height: 4px;
  min-width: 54px;
  border-radius: 2px;
  background: var(--border-light);
  overflow: hidden;
}

.mini-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #ff6f5e, #f6c453);
}

.mini-num {
  width: 24px;
  text-align: right;
  color: var(--text-dim);
}

.amount-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
  font-size: 12px;
  font-weight: 600;
}

.multi-draft {
  margin-top: 14px;
  border-top: 1px dashed var(--border);
  padding-top: 12px;
}

.multi-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.draft-list {
  margin-top: 10px;
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.draft-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
}

.saved-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-bottom: 2px solid var(--border);
}

.pick-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  margin-bottom: 10px;
  flex-wrap: wrap;
  transition: border-color 0.2s;
}

.pick-row.won {
  border-color: rgba(246, 196, 83, 0.55);
  background: linear-gradient(90deg, rgba(246, 196, 83, 0.10), var(--card-bg) 60%);
}

.pick-row.pending {
  border-color: rgba(100, 181, 246, 0.4);
}

.pick-main {
  flex: 1 1 320px;
  min-width: 0;
}

.pick-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  width: 100%;
}

.pick-stamp {
  font-size: 11px;
  color: var(--text-dim, #999);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.pick-balls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.pick-multi {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.multi-balls {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mini-line {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-wrap: wrap;
}

.ticket-balls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.pick-score {
  font-size: 12px;
  white-space: nowrap;
}

.pick-result {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 150px;
}

/* 多期中奖汇总：默认一行汇总，展开后逐期紧凑显示 */
.hit-strip {
  width: 100%;
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  margin-top: 2px;
  border-radius: 8px;
  background: rgba(246, 196, 83, 0.08);
  border: 1px dashed rgba(246, 196, 83, 0.35);
}
.hit-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hit-total {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
}
.hit-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hit-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  line-height: 18px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--card-bg);
}
.hit-chip.lv1,
.hit-chip.lv2 {
  border-left: 3px solid #f6c453;
}
.hit-chip.lv3,
.hit-chip.lv4 {
  border-left: 3px solid #64b5f6;
}
.hit-chip.lv5,
.hit-chip.lv6,
.hit-chip.lv7 {
  border-left: 3px solid #a5d6a7;
}
.hc-issue {
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}
.hc-name {
  color: var(--text-main);
  white-space: nowrap;
}
.hc-bonus {
  font-weight: 700;
  color: #f6c453;
  white-space: nowrap;
}
.hc-prov {
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(100, 181, 246, 0.18);
  color: #64b5f6;
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

.pick-del {
  margin-left: auto;
}
</style>

<style>
/* ============ 中奖弹窗（挂载于 body，需全局样式） ============ */
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
