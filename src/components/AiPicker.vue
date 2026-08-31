<template>
  <div>
    <div class="card-title">AI 选号（本地统计规则引擎）</div>
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="理性购彩提示：彩票开奖为独立随机事件，历史统计不提高中奖概率。本工具仅用于参考组合生成，请量力而行。"
      style="margin-bottom: 14px"
    />

    <div class="ai-controls">
      <div class="ctrl-row">
        <span class="ctrl-label">玩法</span>
        <el-radio-group v-model="playType" size="small">
          <el-radio-button value="single">单注</el-radio-button>
          <el-radio-button value="multi">多注</el-radio-button>
          <el-radio-button v-if="cfg.playMode !== 'direct'" value="duplex">复式</el-radio-button>
          <el-radio-button v-if="cfg.playMode !== 'direct'" value="danTuo">胆拖</el-radio-button>
        </el-radio-group>
        <template v-if="cfg.playMode === 'direct' && Array.isArray(cfg.directTypes) && cfg.directTypes.includes('zuxuan3')">
          <span class="ctrl-label" style="margin-left: 14px">投注方式</span>
          <el-radio-group v-model="zxType" size="small">
            <el-radio-button value="direct">直选</el-radio-button>
            <el-radio-button value="zuxuan3">组选3</el-radio-button>
            <el-radio-button value="zuxuan6">组选6</el-radio-button>
          </el-radio-group>
        </template>
      </div>

      <div class="ctrl-row">
        <template v-if="playType === 'multi'">
          <span class="ctrl-label">注数</span>
          <el-input-number v-model="multiN" :min="1" :max="20" size="small" style="width: 110px" />
        </template>
        <template v-else-if="cfg.playMode !== 'direct' && playType === 'duplex'">
          <span class="ctrl-label">红球数</span>
          <el-input-number v-model="duplexRed" :min="cfg.redCount + 1" :max="cfg.redMax" size="small" style="width: 110px" />
          <span class="ctrl-label" style="margin-left: 14px">蓝球数</span>
          <el-input-number v-model="duplexBlue" :min="cfg.blueCount" :max="cfg.blueMax" size="small" style="width: 110px" />
        </template>
        <template v-else-if="cfg.playMode !== 'direct' && playType === 'danTuo'">
          <span class="ctrl-label">胆码数</span>
          <el-input-number v-model="danN" :min="1" :max="cfg.redCount - 1" size="small" style="width: 110px" />
          <span class="ctrl-label" style="margin-left: 14px">拖码数</span>
          <el-input-number v-model="tuoN" :min="cfg.redCount - danN + 1" :max="cfg.redMax - danN" size="small" style="width: 110px" />
          <template v-if="cfg.blueCount === 1">
            <span class="ctrl-label" style="margin-left: 14px">蓝球个数</span>
            <el-input-number v-model="blueN" :min="cfg.blueCount" :max="cfg.blueMax" size="small" style="width: 110px" />
          </template>
        </template>
        <span v-if="liveAmount > 0" class="amount-pill">共 {{ liveCombos }} 注 · ¥{{ liveAmount }}</span>
      </div>

      <div class="ctrl-row lock-row" v-if="cfg.playMode === 'direct'">
        <span class="ctrl-label">定位选号（每位可多选 = 定位复式，不选由 AI 随机）</span>
        <div class="lock-pools">
          <div class="lock-pool" v-for="(p, pi) in cfg.digits" :key="'dp' + pi">
            <span class="lock-pool-label">{{ p.label }}</span>
            <span
              v-for="n in 10"
              :key="'dpv' + n"
              class="pick-ball pick-ball-red"
              :class="{ locked: posSel[pi] && posSel[pi].includes(n - 1) }"
              @click="togglePos(pi, n - 1)"
            >{{ n - 1 }}</span>
          </div>
          <div class="lock-pool" v-if="cfg.tail">
            <span class="lock-pool-label">尾位</span>
            <span
              v-for="n in 10"
              :key="'dtv' + n"
              class="pick-ball pick-ball-blue"
              :class="{ locked: tailSel.includes(n - 1) }"
              @click="toggleTail(n - 1)"
            >{{ n - 1 }}</span>
          </div>
        </div>
        <el-button v-if="hasPosSel" size="small" text @click="clearPos">清空</el-button>
      </div>
      <div class="ctrl-row" v-else>
        <span class="ctrl-label">自定义号码</span>
        <div class="lock-pools">
          <div class="lock-pool">
            <span class="lock-pool-label">{{ cfg.redLabel }}（{{ lockLimit.red - lockedRed.length }} 个由 AI 补）</span>
            <span
              v-for="n in cfg.redMax"
              :key="'lr' + n"
              class="pick-ball pick-ball-red"
              :class="{ locked: lockedRed.includes(n) }"
              @click="toggleLockRed(n)"
            >{{ pad2(n) }}</span>
          </div>
          <div class="lock-pool">
            <span class="lock-pool-label">{{ cfg.blueLabel }}（{{ lockLimit.blue - lockedBlue.length }} 个由 AI 补）</span>
            <span
              v-for="n in cfg.blueMax"
              :key="'lb' + n"
              class="pick-ball pick-ball-blue"
              :class="{ locked: lockedBlue.includes(n) }"
              @click="toggleLockBlue(n)"
            >{{ pad2(n) }}</span>
          </div>
        </div>
        <el-button v-if="lockedRed.length || lockedBlue.length" size="small" text @click="clearLocked">清空</el-button>
      </div>
      <div class="ctrl-row" v-if="lockedRed.length || lockedBlue.length">
        <span class="dim" style="font-size: 12px">{{ lockHint }}。结果中带金色描边的号码即您自定义的必选号。</span>
      </div>

      <div class="ctrl-row">
        <span class="ctrl-label">生成策略</span>
        <el-checkbox-group v-model="methods" size="small">
          <el-checkbox-button v-for="m in methodList" :key="m.key" :value="m.key">{{ m.label }}</el-checkbox-button>
        </el-checkbox-group>
        <el-button size="small" text @click="methods = methodList.map((x) => x.key)">全选</el-button>
        <el-button size="small" text @click="methods = []">不用策略</el-button>
        <el-button size="small" text @click="methods = [...recommendedMethods()]">恢复默认</el-button>
        <span v-if="!methods.length" class="dim" style="font-size: 12px">当前为纯随机选号，不套用任何统计规则</span>
        <span v-else-if="methods.length < methodList.length" class="dim" style="font-size: 12px">已选 {{ methods.length }}/{{ methodList.length }} 种策略，按权重综合择优</span>
      </div>

      <div class="ctrl-row">
        <span class="ctrl-label">预期得分（满分 100）</span>
        <el-input-number v-model="targetScore" :min="1" :max="100" size="small" style="width: 110px" />
        <span class="dim" style="font-size: 12px">AI 将一直选号，直到平均得分达到该分值</span>
      </div>

      <div class="ctrl-row">
        <span class="ctrl-label">暴力模式次数</span>
        <el-input-number v-model="violentAttempts" :min="1000" :max="1000000" :step="1000" size="small" style="width: 150px" />
        <span class="dim" style="font-size: 12px">暴力模式在 AI 选号界面直接设定，跑满该次数取最高分（与设置页同步）</span>
      </div>

      <div class="ctrl-row" v-if="cfg.zhuijia">
        <el-checkbox v-model="append">大乐透追加投注（每注 +1 元，一/二等奖奖金 ×1.8）</el-checkbox>
      </div>

      <div class="ctrl-row">
        <span class="ctrl-label">倍数投注（1~99 倍）</span>
        <el-input-number v-model="multiple" :min="1" :max="99" size="small" style="width: 110px" />
        <span class="dim" style="font-size: 12px">官方玩法：多倍投注，金额与中奖奖金同倍</span>
      </div>

      <div class="ctrl-row" v-if="cfg.blueCount > 1 && playType === 'danTuo'">
        <span class="ctrl-label">后区胆拖</span>
        <span class="dim" style="font-size: 12px; margin-right: 6px">后区胆码</span>
        <el-input-number v-model="blueDanN" :min="0" :max="cfg.blueCount - 1" size="small" style="width: 90px" />
        <span class="dim" style="font-size: 12px; margin: 0 6px 0 10px">后区拖码</span>
        <el-input-number v-model="blueTuoN" :min="cfg.blueCount - blueDanN" :max="cfg.blueMax - blueDanN" size="small" style="width: 90px" />
        <span class="dim" style="font-size: 12px">大乐透官方玩法：后区胆拖（0 胆 = 普通选号）</span>
      </div>

      <div class="ctrl-row actions">
        <el-button type="danger" @click="generate">生成推荐</el-button>
        <el-button type="primary" :disabled="searching && !isViolent && stopping" @click="searching && !isViolent ? stopSearching() : pickUntilTarget(false)">
          {{ searching && !isViolent ? (stopping ? '正在终止…' : `AI 一直选… 已尝试 ${searchingCount} 次 · 点击终止`) : 'AI 一直选（达到预期分）' }}
        </el-button>
        <el-button type="warning" :disabled="searching && isViolent && stopping" @click="searching && isViolent ? stopSearching() : pickUntilTarget(true)">
          {{ searching && isViolent ? (stopping ? '正在终止…' : `暴力模式… 已尝试 ${searchingCount} 次 · 点击终止`) : '暴力模式' }}
        </el-button>
        <el-button class="ghost-btn" @click="generate">换一组</el-button>
        <span v-if="generatedAt" class="dim">生成于 {{ generatedAt }}</span>
      </div>
    </div>

    <div v-if="searching" class="searching-tip">
      <el-progress :percentage="searchProgress" :stroke-width="8" style="max-width: 420px" />
      <div class="dim" style="margin-top: 6px; font-size: 12px">{{ isViolent ? `暴力模式：达到预期分也不停止，一直跑到设定次数（${violentAttempts} 次），并统计多次出现的号码` : '正在按统计规则循环生成并评分，达到预期得分即停止…' }}</div>
    </div>

    <div v-else-if="rolling" class="ticket roll-ticket">
      <div class="ticket-head">
        <el-tag size="small" type="warning" style="margin-right: 12px">摇奖中…</el-tag>
        <span class="ticket-balls" v-if="cfg.playMode !== 'direct'">
          <span v-for="n in rollBalls.red" :key="'r' + n" class="ball ball-red rolling">{{ pad2(n) }}</span>
          <span v-for="(b, bi) in rollBalls.blue" :key="'b' + bi" class="ball ball-blue rolling">{{ pad2(b) }}</span>
        </span>
        <span class="ticket-balls" v-else>
          <span v-for="(d, di) in rollBalls.digits" :key="'rd' + di" class="ball ball-red rolling">{{ d }}</span>
          <span v-if="rollBalls.tail != null" class="ball ball-blue rolling">{{ rollBalls.tail }}</span>
        </span>
        <span class="ticket-score">正在滚动选号…</span>
      </div>
    </div>

    <div v-else-if="!result" class="empty-tip">选择玩法与预期得分，点击「生成推荐」或「AI 一直选」开始</div>

    <template v-else>
      <div v-if="result.attempts" class="attempt-line">
        <el-tag :type="result.stopped ? 'info' : (result.hitTarget === false ? 'warning' : 'success')" size="small" style="margin-right: 8px">
          {{ result.stopped ? '已手动终止，输出当前最优解' : (result.hitTarget === false ? '未能在上限内达到预期分，取最高分组合' : '已达标') }}
        </el-tag>
        <span class="dim" style="font-size: 12px">共尝试 {{ result.attempts }} 次</span>
        <span v-if="result.violentMode" class="dim" style="font-size: 12px; margin-left: 8px">· 暴力模式：达到预期分后继续跑满设定次数</span>
      </div>

      <div class="ticket">
        <div class="ticket-head">
          <el-tag size="small" type="danger" style="margin-right: 12px">{{ playLabel }}</el-tag>
          <template v-if="cfg.playMode === 'direct'">
            <span class="ticket-balls" v-if="result.ticket.type === 'single'">
              <span v-for="(d, di) in result.ticket.digits" :key="'d' + di" class="ball ball-red">{{ d }}</span>
              <span v-if="result.ticket.tail != null" class="ball ball-blue">{{ result.ticket.tail }}</span>
            </span>
            <span class="ticket-balls" v-else-if="result.ticket.type === 'duplex'">
              <span class="multi-mini" v-for="(arr, pi) in result.ticket.pos" :key="'pos' + pi">
                <span v-for="v in arr" :key="'pv' + v" class="ball ball-red" :class="{ 'ball-locked': isPosSel(pi, v) }" style="width: 22px; height: 22px; font-size: 10px">{{ v }}</span>
              </span>
              <span v-if="result.ticket.tail && result.ticket.tail.length" class="multi-mini">
                <span v-for="v in result.ticket.tail" :key="'tv' + v" class="ball ball-blue" :class="{ 'ball-locked': tailSel.includes(v) }" style="width: 22px; height: 22px; font-size: 10px">{{ v }}</span>
              </span>
            </span>
            <span class="ticket-balls" v-else>
              <span class="multi-mini" v-for="(t, i) in result.ticket.tickets" :key="i">
                <span v-for="(d, di) in t.digits" :key="'d' + di" class="ball ball-red" style="width: 22px; height: 22px; font-size: 10px">{{ d }}</span>
                <span v-if="t.tail != null" class="ball ball-blue" style="width: 22px; height: 22px; font-size: 10px">{{ t.tail }}</span>
              </span>
            </span>
          </template>
          <template v-else-if="result.ticket.type === 'single' || result.ticket.type === 'duplex'">
            <span class="ticket-balls">
              <span v-for="n in result.ticket.red" :key="'r' + n" class="ball ball-red" :class="{ 'ball-locked': isLockedRed(n) }">{{ pad2(n) }}</span>
              <span v-for="(b, bi) in result.ticket.blue" :key="'b' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }">{{ pad2(b) }}</span>
            </span>
          </template>
          <template v-else-if="result.ticket.type === 'danTuo'">
            <span class="ticket-balls">
              <span v-for="n in result.ticket.danRed" :key="'d' + n" class="ball ball-amber" :class="{ 'ball-locked': isLockedRed(n) }" :title="'胆码 ' + pad2(n)">{{ pad2(n) }}</span>
              <span v-for="n in result.ticket.tuoRed" :key="'t' + n" class="ball ball-red-soft" :title="'拖码 ' + pad2(n)">{{ pad2(n) }}</span>
              <template v-if="result.ticket.blueDan && result.ticket.blueDan.length">
                <span v-for="(b, bi) in result.ticket.blueDan" :key="'bd' + bi" class="ball ball-blue-soft" :title="'后区胆码 ' + pad2(b)">{{ pad2(b) }}</span>
                <span v-for="(b, bi) in result.ticket.blueTuo" :key="'bt' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }" :title="'后区拖码 ' + pad2(b)">{{ pad2(b) }}</span>
              </template>
              <template v-else>
                <span v-for="(b, bi) in result.ticket.blue" :key="'b' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }">{{ pad2(b) }}</span>
              </template>
            </span>
          </template>
          <template v-else>
            <span class="ticket-balls">
              <span v-for="(t, i) in result.ticket.tickets" :key="i" class="multi-mini">
                <span v-for="n in t.red" :key="'r' + n" class="ball ball-red" :class="{ 'ball-locked': isLockedRed(n) }" style="width: 22px; height: 22px; font-size: 10px">{{ pad2(n) }}</span>
                <span v-for="(b, bi) in t.blue" :key="'b' + bi" class="ball ball-blue" :class="{ 'ball-locked': isLockedBlue(b) }" style="width: 22px; height: 22px; font-size: 10px">{{ pad2(b) }}</span>
              </span>
            </span>
          </template>
          <span class="ticket-score">
            {{ result.count > 1 ? `平均分 ${result.total}（最高 ${result.max} · 最低 ${result.min} · 共 ${result.count} 注）` : `综合得分 ${result.total}` }}
          </span>
          <span v-if="resultCombos > 0" class="amount-pill">共 {{ resultCombos }} 注 · ¥{{ resultAmount }}</span>
        </div>

        <div v-if="result.count === 1 && firstLine" class="ticket-reason">
          <div class="reason-line">
            <template v-if="cfg.playMode !== 'direct'">
              <template v-if="hasMethod('zone')">区间 {{ firstLine.score.zones[0] }}:{{ firstLine.score.zones[1] }}:{{ firstLine.score.zones[2] }}（目标 {{ cfg.zoneTarget.join(':') }}）</template>
              <template v-if="hasMethod('odd')">&nbsp;|&nbsp; 奇偶 {{ firstLine.score.odds }}:{{ cfg.redCount - firstLine.score.odds }}</template>
              <template v-if="hasMethod('sum')">&nbsp;|&nbsp; 和值 {{ firstLine.score.sum }}（区间 {{ cfg.sumMin }}~{{ cfg.sumMax }}）</template>
              <template v-if="hasMethod('cons')">&nbsp;|&nbsp; 连号 {{ firstLine.score.cons }} 组</template>
              <template v-if="hasMethod('hot')">&nbsp;|&nbsp; 热号 {{ firstLine.score.hotIn }} 个 / 冷号 {{ firstLine.score.coldIn }} 个</template>
              <template v-if="hasMethod('size')">&nbsp;|&nbsp; 大小 {{ firstLine.score.bigs }}:{{ cfg.redCount - firstLine.score.bigs }}</template>
              <template v-if="hasMethod('span')">&nbsp;|&nbsp; 跨度 {{ firstLine.score.span }}</template>
              <template v-if="hasMethod('prime')">&nbsp;|&nbsp; 质合 {{ firstLine.score.primes }}:{{ cfg.redCount - firstLine.score.primes }}</template>
              <template v-if="hasMethod('tail')">&nbsp;|&nbsp; 尾组 {{ firstLine.score.tailPairs }} 对</template>
              <template v-if="hasMethod('repeat')">&nbsp;|&nbsp; 重号 {{ firstLine.score.reps }} 个</template>
            </template>
            <template v-else>
              <template v-if="hasMethod('sum')">和值 {{ firstLine.score.sum }}（区间 {{ cfg.sumMin }}~{{ cfg.sumMax }}）</template>
              <template v-if="hasMethod('odd')">&nbsp;|&nbsp; 奇偶 {{ directStats.odds }}:{{ directStats.digits - directStats.odds }}</template>
              <template v-if="hasMethod('size')">&nbsp;|&nbsp; 大小 {{ directStats.bigs }}:{{ directStats.digits - directStats.bigs }}</template>
              <template v-if="hasMethod('form') || hasMethod('route')">&nbsp;|&nbsp; 形态 {{ directStats.form }}</template>
              <template v-if="hasMethod('repeat')">&nbsp;|&nbsp; 重号偏好 {{ Math.round(firstLine.score.repeatScore) }} 分</template>
              <template v-if="hasMethod('span')">&nbsp;|&nbsp; 跨度 {{ directStats.span }}</template>
              <template v-if="hasMethod('route')">&nbsp;|&nbsp; 012路 {{ directStats.routeCounts.join(':') }}</template>
              <template v-if="hasMethod('prime')">&nbsp;|&nbsp; 质数 {{ directStats.primeCount }} 个</template>
              <template v-if="hasMethod('tail')">&nbsp;|&nbsp; 尾位 {{ firstLine.tail != null ? firstLine.tail : '—' }}</template>
              <template v-if="hasMethod('headTail')">&nbsp;|&nbsp; 龙头 {{ firstLine.digits[0] }} · 凤尾 {{ firstLine.digits[firstLine.digits.length - 1] }}</template>
              <template v-if="hasMethod('mirror')">&nbsp;|&nbsp; 镜像对称 {{ Math.round(firstLine.score.mirrorScore) }} 分</template>
              <template v-if="hasMethod('sumTail')">&nbsp;|&nbsp; 和值尾 {{ firstLine.score.sum % 10 }}</template>
            </template>
          </div>
          <div class="score-bars">
            <div class="score-bar" v-for="item in scoreItems(firstLine.score)" :key="item.label">
              <span class="score-label">{{ item.label }}</span>
              <span class="score-track">
                <span class="score-fill" :style="{ width: item.value + '%' }"></span>
              </span>
              <span class="score-num">{{ Math.round(item.value) }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="result.count > 1" class="dim" style="margin-top: 8px; font-size: 12px">
          玩法说明：{{ playDesc }} 评分取全部展开单注的平均分，用于衡量整张票的结构质量。
        </div>
      </div>
      <div v-if="freqTop.length" class="freq-box">
        <div class="freq-title">暴力模式 · 多次出现号码统计（辅助参考，主结果为上方号码组合）</div>
        <div class="freq-chips">
          <span v-for="(f, fi) in freqTop" :key="fi" class="freq-chip">
            <template v-if="f.pos != null"><span class="fc-label">{{ cfg.digits[f.pos].label }}</span><b>{{ f.val }}</b></template>
            <template v-else-if="f.tail"><span class="fc-label">尾</span><b>{{ f.val }}</b></template>
            <template v-else-if="f.red"><b class="fc-red">{{ pad2(f.val) }}</b></template>
            <template v-else><b class="fc-blue">{{ pad2(f.val) }}</b></template>
            <span class="fc-cnt">{{ f.cnt }} 次</span>
          </span>
        </div>
      </div>
      <div class="ai-save-row" style="margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
        <el-button type="primary" plain @click="saveToPicks">保存到自选号</el-button>
        <span v-if="savedTip" class="dim" style="font-size: 12px; color: #67c23a">{{ savedTip }}</span>
      </div>
      <div class="dim" style="margin-top: 10px">
        统计口径：热号=近 10 期出现 ≥3 次；冷号=当前遗漏 ≥10 期；主推不含冷号。单注金额 2 元{{ cfg.zhuijia ? '，大乐透追加每注 +1 元' : '' }}。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createPickerEngine, calcPlay, scoreTicketPlay, ALL_METHODS, METHOD_LABELS, calcDirectPlay, expandDirectTicket, createDirectPickerEngine, computeDirectStats, scoreDigits, generateDirect, scoreItemsFor, generateBatch } from '../utils/picker-engine'
import { getGPUState, initGPU } from '../utils/gpu-engine'
import { checkTicketHistory } from '../utils/prize-check'
import { pad2 } from '../utils/game-config'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const result = ref(null)
const generatedAt = ref('')
const playType = ref('single')
const multiN = ref(3)
const duplexRed = ref(props.cfg.redCount + 1)
const duplexBlue = ref(props.cfg.blueCount)
const danN = ref(props.cfg.redCount - 1)
const tuoN = ref(3)
// 后区胆拖（大乐透）：后区胆码数（0=不启用后区胆拖）
const blueDanN = ref(0)
const blueTuoN = ref(props.cfg.blueCount)
// 倍数投注：1~99 倍，金额与奖金同倍
const multiple = ref(1)
const targetScore = ref(70)
const searching = ref(false)
const searchingCount = ref(0)
const MAX_ATTEMPTS = 20000
// AI 选号设置（设置页写入同一 localStorage key）：一直选上限次数 / 暴力模式开关与次数
const maxAttempts = ref(Number(localStorage.getItem('lp-ai-max-attempts')) || 20000)
const violentEnabled = ref(localStorage.getItem('lp-ai-violent') === 'on')
const violentAttempts = ref(Number(localStorage.getItem('lp-ai-violent-attempts')) || 100000)
const isViolent = ref(false)
const freq = reactive({})
const stopping = ref(false)
let cancelFlag = false
// GPU 加速开关（设置页写入同一 localStorage key lp-gpu-accel，默认开启）
const gpuAccel = ref(localStorage.getItem('lp-gpu-accel') !== 'off')
const gpuLevel = ref('')
function onGpuSettingsChange() {
  gpuAccel.value = localStorage.getItem('lp-gpu-accel') !== 'off'
}
window.addEventListener('lp-ai-settings-change', onGpuSettingsChange)
// 设置页手动切换 GPU / 加速方案后，按新偏好重新初始化引擎（方案锁定在 gpu-engine 内部读取 localStorage）
window.addEventListener('lp-gpu-pref-change', () => {
  initGPU(true)
    .then(() => {
      const st = getGPUState()
      gpuLevel.value = st && st.level ? st.level : ''
    })
    .catch(() => {})
})
// 异步探测 GPU 层级（不阻塞界面）
initGPU()
  .then(() => {
    const st = getGPUState()
    gpuLevel.value = st && st.level ? st.level : ''
  })
  .catch(() => {})
const rolling = ref(false)
const rollBalls = ref({ red: [], blue: [] })
let rollTimer = null

// 生成策略：空数组=真随机；默认全选
const methodList = ALL_METHODS.map((k) => ({ key: k, label: METHOD_LABELS[k] }))
// 默认选中老彩民使用频率最高、最经典的 6 种：区间分布 / 奇偶均衡 / 大小均衡 / 冷热倾向 / 和值区间 / 重号参照
const DEFAULT_METHODS = ['zone', 'odd', 'size', 'hot', 'sum', 'repeat']
// 按彩种推荐策略：切换彩种时默认勾选该彩种的推荐组合（直位数字彩推荐跨度/尾数/012路等，乐透彩推荐区间/奇偶/冷热等）
function recommendedMethods() {
  const rec = props.cfg && props.cfg.recommendMethods
  return rec && rec.length ? rec : DEFAULT_METHODS
}
const methods = ref([...recommendedMethods()])
const append = ref(false)

// 暴力模式次数在 AI 选号界面可直接设定，与设置页共用 localStorage
watch(violentAttempts, (v) => {
  const n = Math.max(1000, Math.min(1000000, Number(v) || 100000))
  violentAttempts.value = n
  localStorage.setItem('lp-ai-violent-attempts', String(n))
})

// 自定义号码：用户锁定必选号，剩余由 AI 补齐
const lockedRed = ref([])
const lockedBlue = ref([])

// 直位玩法（3D/排列3/排列5/7星彩）：定位选号 + 组选方式
const zxType = ref('direct')
const posSel = ref(Array.from({ length: props.cfg.digits ? props.cfg.digits.length : 0 }, () => []))
const tailSel = ref([])

const zxLabel = computed(() => {
  const map = { direct: '直选', zuxuan3: '组选3', zuxuan6: '组选6' }
  return map[zxType.value] || '直选'
})

const hasPosSel = computed(() => posSel.value.some((a) => a.length) || tailSel.value.length > 0)

function togglePos(p, v) {
  const arr = posSel.value[p]
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}

function toggleTail(v) {
  const i = tailSel.value.indexOf(v)
  if (i >= 0) tailSel.value.splice(i, 1)
  else tailSel.value.push(v)
}

function clearPos() {
  posSel.value = posSel.value.map(() => [])
  tailSel.value = []
}

function isPosSel(p, v) {
  return posSel.value[p].includes(v)
}

// 切换彩种时重置直位状态并按彩种推荐策略
watch(() => props.cfg.key, () => {
  zxType.value = 'direct'
  posSel.value = Array.from({ length: props.cfg.digits ? props.cfg.digits.length : 0 }, () => [])
  tailSel.value = []
  playType.value = 'single'
  methods.value = [...recommendedMethods()]
})

/** 各玩法可自定义号码上限（与彩票店玩法参数一致） */
const lockLimit = computed(() => {
  if (playType.value === 'duplex') return { red: duplexRed.value, blue: duplexBlue.value }
  if (playType.value === 'danTuo') return { red: danN.value, blue: props.cfg.blueCount === 1 ? blueN.value : props.cfg.blueCount }
  return { red: props.cfg.redCount, blue: props.cfg.blueCount }
})

/** 自定义锁定玩法说明 */
const lockHint = computed(() => {
  const r = lockLimit.value.red - lockedRed.value.length
  const b = lockLimit.value.blue - lockedBlue.value.length
  if (playType.value === 'single') return `已锁定 ${lockedRed.value.length} 红 ${lockedBlue.value.length} 蓝，剩余 ${r} 红 + ${b} 蓝由 AI 选出`
  if (playType.value === 'multi') return `已锁定 ${lockedRed.value.length} 红 ${lockedBlue.value.length} 蓝，每注均包含锁定号，剩余由 AI 为每注补全`
  if (playType.value === 'duplex') return `已锁定 ${lockedRed.value.length} 红 ${lockedBlue.value.length} 蓝，AI 补齐到 ${duplexRed.value} 红 + ${duplexBlue.value} 蓝复式集合`
  return `已锁定 ${lockedRed.value.length} 红全部作为胆码，AI 补齐到 ${danN.value} 胆 ${tuoN.value} 拖，剩余 ${b} 个${props.cfg.blueLabel}由 AI 选出`
})

/** 切换玩法或玩法参数时，裁剪超出上限的锁定号 */
watch([playType, duplexRed, duplexBlue, danN], () => {
  const lim = lockLimit.value
  if (lockedRed.value.length > lim.red) lockedRed.value = lockedRed.value.slice(0, lim.red)
  if (lockedBlue.value.length > lim.blue) lockedBlue.value = lockedBlue.value.slice(0, lim.blue)
})

function toggleLockRed(n) {
  const i = lockedRed.value.indexOf(n)
  if (i >= 0) {
    lockedRed.value.splice(i, 1)
    return
  }
  if (lockedRed.value.length >= lockLimit.value.red) {
    ElMessage.warning(`当前玩法最多自定义 ${lockLimit.value.red} 个${props.cfg.redLabel}`)
    return
  }
  lockedRed.value.push(n)
}

function toggleLockBlue(n) {
  const i = lockedBlue.value.indexOf(n)
  if (i >= 0) {
    lockedBlue.value.splice(i, 1)
    return
  }
  if (lockedBlue.value.length >= lockLimit.value.blue) {
    ElMessage.warning(`当前玩法最多自定义 ${lockLimit.value.blue} 个${props.cfg.blueLabel}`)
    return
  }
  lockedBlue.value.push(n)
}

function clearLocked() {
  lockedRed.value = []
  lockedBlue.value = []
}

function isLockedRed(n) {
  return lockedRed.value.includes(n)
}

function isLockedBlue(n) {
  return lockedBlue.value.includes(n)
}

function randomRollBalls() {
  // Fisher-Yates 无偏洗牌：替代 sort(() => Math.random()-0.5) 的有偏随机
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  if (props.cfg.playMode === 'direct') {
    const nPos = props.cfg.digits.length
    rollBalls.value = {
      digits: Array.from({ length: nPos }, () => Math.floor(Math.random() * 10)),
      tail: props.cfg.tail != null ? Math.floor(Math.random() * (props.cfg.tailMax + 1)) : null
    }
    return
  }
  const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
  const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
  rollBalls.value = {
    red: shuffle(pool).slice(0, props.cfg.redCount).sort((a, b) => a - b),
    blue: shuffle(bpool).slice(0, props.cfg.blueCount).sort((a, b) => a - b)
  }
}

function stopRoll() {
  if (rollTimer) {
    clearInterval(rollTimer)
    rollTimer = null
  }
  rolling.value = false
}

/** 播放摇奖动画，结束后定格展示最终结果 */
function playRoll(final) {
  stopRoll()
  rolling.value = true
  result.value = null
  randomRollBalls()
  rollTimer = setInterval(randomRollBalls, 90)
  setTimeout(() => {
    stopRoll()
    result.value = final
    generatedAt.value = nowTime()
  }, 1500)
}

const currentPlay = computed(() => {
  const base = { append: append.value && props.cfg.zhuijia, multiple: multiple.value }
  // 直位玩法：3D/排列3/排列5/7星彩
  if (props.cfg.playMode === 'direct') {
    const pos = posSel.value.map((a) => [...a].sort((x, y) => x - y))
    const tail = props.cfg.tail ? [...tailSel.value].sort((x, y) => x - y) : []
    const hasPos = pos.some((a) => a.length) || tail.length > 0
    if (hasPos) {
      return { type: 'duplex', pos, tail: props.cfg.tail ? tail : undefined, zx: zxType.value, ...base }
    }
    return {
      type: playType.value === 'multi' ? 'multi' : 'single',
      ...(playType.value === 'multi' ? { n: multiN.value } : {}),
      zx: zxType.value,
      ...base
    }
  }
  const locked = {
    red: lockedRed.value.slice().sort((a, b) => a - b),
    blue: lockedBlue.value.slice().sort((a, b) => a - b)
  }
  const hasLock = locked.red.length > 0 || locked.blue.length > 0
  if (playType.value === 'single') return { type: 'single', ...base, ...(hasLock ? { locked } : {}) }
  if (playType.value === 'multi') return { type: 'multi', n: multiN.value, ...base, ...(hasLock ? { locked } : {}) }
  if (playType.value === 'duplex') return { type: 'duplex', redCount: duplexRed.value, blueCount: duplexBlue.value, ...base, ...(hasLock ? { locked } : {}) }
  const danTuoBase = { type: 'danTuo', danN: danN.value, tuoN: tuoN.value, ...base, ...(hasLock ? { locked } : {}) }
  // 复式胆拖：双色球胆拖蓝球多选（官方玩法）
  if (props.cfg.blueCount === 1 && blueN.value > 1) danTuoBase.blueCount = blueN.value
  // 大乐透后区胆拖：blueDanN>0 时启用后区胆码+拖码
  if (props.cfg.blueCount > 1 && blueDanN.value > 0) {
    danTuoBase.blueDanN = blueDanN.value
    danTuoBase.blueTuoN = blueTuoN.value
  }
  return danTuoBase
})

const liveCalc = computed(() => (props.cfg.playMode === 'direct' ? calcDirectPlay(props.cfg, currentPlay.value) : calcPlay(props.cfg, currentPlay.value)))
const liveCombos = computed(() => liveCalc.value.combos)
const liveAmount = computed(() => liveCalc.value.amount)

// 后区胆拖边界修正：胆码不超过 blueCount-1，拖码至少补足 blueCount
watch([blueDanN, blueTuoN, playType], () => {
  if (blueDanN.value < 0) blueDanN.value = 0
  const maxDan = props.cfg.blueCount - 1
  if (blueDanN.value > maxDan) blueDanN.value = maxDan
  const minTuo = props.cfg.blueCount - blueDanN.value
  if (blueTuoN.value < minTuo) blueTuoN.value = minTuo
  const maxTuo = props.cfg.blueMax - blueDanN.value
  if (blueTuoN.value > maxTuo) blueTuoN.value = maxTuo
})

const playLabel = computed(() => {
  if (props.cfg.playMode === 'direct') {
    let label = zxLabel.value
    if (hasPosSel.value) label += ' 定位复式'
    else if (playType.value === 'multi') label += ` ×${multiN.value}注`
    if (multiple.value > 1) label += ` ×${multiple.value}倍`
    return label
  }
  const map = { single: '单注', multi: `多注 ×${multiN.value}`, duplex: `复式 ${duplexRed.value}+${duplexBlue.value}`, danTuo: `胆拖 ${danN.value}胆${tuoN.value}拖` }
  let label = map[playType.value] + (append.value && props.cfg.zhuijia ? '（追加）' : '')
  if (playType.value === 'danTuo' && props.cfg.blueCount > 1 && blueDanN.value > 0) label += `·后区${blueDanN.value}胆${blueTuoN.value}拖`
  if (multiple.value > 1) label += ` ×${multiple.value}倍`
  return label
})

const playDesc = computed(() => {
  if (props.cfg.playMode === 'direct') {
    let desc = `${zxLabel.value}：每位从 0-9 中选 1 个数字，顺序一致即中奖`
    if (zxType.value === 'zuxuan3') desc = '组选3：3 位号码中有 2 位相同，不计顺序，含 3 种排列'
    if (zxType.value === 'zuxuan6') desc = '组选6：3 位号码各不相同，不计顺序，含 6 种排列'
    if (hasPosSel.value) desc += `；定位复式每位可多选，自动组合成 ${liveCombos.value} 注`
    else if (playType.value === 'multi') desc += `；共 ${multiN.value} 注，每注独立对奖`
    if (multiple.value > 1) desc += ` 已开启 ${multiple.value} 倍投注，金额与奖金同倍。`
    return desc
  }
  const map = {
    single: '单注',
    multi: `共 ${multiN.value} 注单式号码，每注独立对奖。`,
    duplex: `红球选 ${duplexRed.value} 个、蓝球选 ${duplexBlue.value} 个，自动组合成 ${liveCombos.value} 注。`,
    danTuo: `${danN.value} 个胆码 + ${tuoN.value} 个拖码，自动组合成 ${liveCombos.value} 注。`
  }
  let desc = map[playType.value]
  if (playType.value === 'danTuo' && props.cfg.blueCount === 1 && blueN.value > 1) {
    desc = `${danN.value} 个胆码 + ${tuoN.value} 个拖码 + 蓝球选 ${blueN.value} 个（复式胆拖），自动组合成 ${liveCombos.value} 注。`
  }
  if (playType.value === 'danTuo' && props.cfg.blueCount > 1 && blueDanN.value > 0) {
    desc = `${danN.value} 个前区胆码 + ${tuoN.value} 个前区拖码 + 后区 ${blueDanN.value} 胆 ${blueTuoN.value} 拖，自动组合成 ${liveCombos.value} 注。`
  }
  if (multiple.value > 1) desc += ` 已开启 ${multiple.value} 倍投注，金额与奖金同倍。`
  desc += append.value && props.cfg.zhuijia ? ' 已开启追加投注，一/二等奖奖金 ×1.8。' : ''
  return desc
})

const firstLine = computed(() => (result.value && result.value.lines && result.value.lines.length ? result.value.lines[0] : null))

/** 结果票的实际投注注数与金额（含追加/倍数），用于结果区金额展示 */
const resultCalc = computed(() => {
  if (!result.value) return { combos: 0, amount: 0 }
  const ticket = { ...result.value.ticket, multiple: multiple.value }
  if (props.cfg.playMode === 'direct') return calcDirectPlay(props.cfg, ticket)
  if (props.cfg.zhuijia) ticket.append = append.value
  return calcPlay(props.cfg, ticket)
})
const resultCombos = computed(() => resultCalc.value.combos)
const resultAmount = computed(() => resultCalc.value.amount)

/** 组选形态归一：zuxuan3 = 3位2种数字（1个重复）；zuxuan6 = 3位互不相同 */
function normalizeGroupDigits(zx, digits) {
  const arr = (digits || []).map(Number)
  if (zx === 'direct') return arr.slice(0, 3)
  const uniq = [...new Set(arr)]
  const rnd = (exclude) => {
    let v = Math.floor(Math.random() * 10)
    while (exclude.includes(v)) v = Math.floor(Math.random() * 10)
    return v
  }
  if (zx === 'zuxuan3') {
    let out
    if (uniq.length === 3) out = [uniq[0], uniq[0], uniq[1]]
    else if (uniq.length === 2) out = [uniq[0], uniq[0], uniq[1]]
    else out = [uniq[0], uniq[0], rnd([uniq[0]])]
    return out.slice(0, 3).sort((a, b) => a - b)
  }
  // zuxuan6
  let out
  if (uniq.length === 3) out = uniq
  else if (uniq.length === 2) out = [uniq[0], uniq[1], rnd(uniq)]
  else out = [uniq[0], rnd([uniq[0]]), rnd([uniq[0]])]
  while (new Set(out).size < 3) out[2] = rnd(out.slice(0, 2))
  return out.slice(0, 3).sort((a, b) => a - b)
}

/** 直位结果票包装：单注/多注统一结构并带 zx */
function directTicketFromLines(lines) {
  const zx = zxType.value
  const tickets = lines.map((l) => ({ digits: normalizeGroupDigits(zx, l.digits), tail: l.tail != null ? l.tail : null }))
  if (tickets.length > 1) return { type: 'multi', tickets, zx }
  return { type: 'single', digits: tickets[0].digits, tail: tickets[0].tail, zx }
}

/** 直位单次生成（同步） */
function generateDirectOnce(n) {
  const lines = []
  for (let j = 0; j < n; j++) {
    const g = generateDirect(props.cfg, props.draws, { tries: 200 })
    if (g) lines.push(g)
  }
  if (!lines.length) return null
  const ticket = directTicketFromLines(lines)
  const totals = lines.map((l) => l.score.total || 0)
  return {
    ticket,
    total: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
    max: Math.round(Math.max(...totals)),
    min: Math.round(Math.min(...totals)),
    count: totals.length,
    lines,
    stats: computeDirectStats(props.cfg, props.draws)
  }
}

/** 直位定位复式：展开每注并评分（同步） */
function generateDirectDuplex() {
  const play = currentPlay.value
  const st = computeDirectStats(props.cfg, props.draws)
  const lines = expandDirectTicket(props.cfg, play).map((c) => ({
    ...c,
    score: st ? scoreDigits(props.cfg, c.digits, c.tail, st) : { total: 0 }
  }))
  const totals = lines.map((l) => l.score.total || 0)
  return {
    ticket: play,
    total: lines.length ? Math.round(totals.reduce((a, b) => a + b, 0) / lines.length) : 0,
    max: lines.length ? Math.round(Math.max(...totals)) : 0,
    min: lines.length ? Math.round(Math.min(...totals)) : 0,
    count: lines.length,
    lines,
    stats: st
  }
}

function generate() {
  if (props.cfg.playMode === 'direct') {
    const play = currentPlay.value
    const r = play.type === 'duplex' ? generateDirectDuplex() : generateDirectOnce(play.type === 'multi' ? play.n : 1)
    if (r) playRoll(r)
    return
  }
  const engine = createPickerEngine(props.cfg, methods.value)
  const r = engine.generatePlay(props.draws, currentPlay.value)
  if (r) {
    playRoll(r)
  }
}

function resetFreq() {
  Object.keys(freq).forEach((k) => delete freq[k])
}

// 统计一张票中各号码出现次数（暴力模式用）。组合彩：红/蓝球；直位彩：每位数字 + 尾位
function collectTicketFreq(ticket) {
  if (!ticket) return
  if (props.cfg.playMode === 'direct') {
    const lines = ticket.type === 'multi' && ticket.tickets ? ticket.tickets : ticket.type === 'single' ? [ticket] : []
    for (const ln of lines) {
      if (ln && Array.isArray(ln.digits)) {
        ln.digits.forEach((v, pi) => {
          const k = 'p_' + pi + '_' + v
          freq[k] = (freq[k] || 0) + 1
        })
      }
      if (ln && ln.tail != null) {
        const k = 'tail_' + ln.tail
        freq[k] = (freq[k] || 0) + 1
      }
    }
    return
  }
  // 组合彩：复式/胆拖/定位复式展开过大，不做频次统计
  if (!ticket || (ticket.type !== 'multi' && ticket.type !== 'single')) return
  const lines = ticket.type === 'multi' && ticket.tickets ? ticket.tickets : [ticket]
  for (const ln of lines) {
    if (ln && Array.isArray(ln.red)) ln.red.forEach((v) => {
      const k = 'red_' + v
      freq[k] = (freq[k] || 0) + 1
    })
    if (ln && Array.isArray(ln.blue)) ln.blue.forEach((v) => {
      const k = 'blue_' + v
      freq[k] = (freq[k] || 0) + 1
    })
  }
}

// 暴力模式高频号码：按出现次数降序取前 12
const freqTop = computed(() => {
  const arr = Object.keys(freq).map((k) => {
    const parts = k.split('_')
    const cnt = freq[k]
    if (parts[0] === 'p') return { pos: Number(parts[1]), val: Number(parts[2]), cnt }
    if (parts[0] === 'tail') return { tail: true, val: Number(parts[1]), cnt }
    if (parts[0] === 'red') return { red: true, val: Number(parts[1]), cnt }
    return { blue: true, val: Number(parts[1]), cnt }
  })
  return arr.sort((a, b) => b.cnt - a.cnt).slice(0, 12)
})

/** 选号进行中再次点击按钮：请求终止，循环在下一个让出点停下并输出当前最优解 */
function stopSearching() {
  if (!searching.value || stopping.value) return
  stopping.value = true
  cancelFlag = true
}

/** 渲染最终结果：手动终止直接定格展示（不再播摇奖动画），正常结束保留摇奖动画 */
function renderResult(final) {
  if (final && final.stopped) {
    result.value = final
    generatedAt.value = nowTime()
  } else if (final) {
    playRoll(final)
  }
}

async function pickUntilTarget(violent) {
  if (!props.draws || !props.draws.length) return
  isViolent.value = !!violent
  const totalCap = violent ? Math.max(1000, violentAttempts.value) : Math.max(1000, maxAttempts.value)
  searching.value = true
  searchingCount.value = 0
  stopping.value = false
  cancelFlag = false
  if (violent) resetFreq()
  stopRoll()
  result.value = null
  const isDirect = props.cfg.playMode === 'direct'
  const play = currentPlay.value
  // GPU 加速判定：开关开启且非复杂路径（组合彩复式/胆拖/锁定、直位定位复式均降级 CPU 保证正确性）
  const hasLock = isDirect
    ? !!(play.posSel && play.posSel.some((arr) => arr && arr.length > 1))
    : !!(play.locked && ((play.locked.red && play.locked.red.length) || (play.locked.blue && play.locked.blue.length)))
  const complexPath = isDirect ? play.type === 'duplex' : (play.type === 'duplex' || play.type === 'danTuo' || hasLock)
  const canAccel = gpuAccel.value && !complexPath && totalCap >= 1000
  const batchOpts = {
    count: totalCap,
    target: targetScore.value,
    play,
    methods: methods.value,
    forceFull: violent,
    collectFreq: violent,
    onProgress: (i) => { searchingCount.value = i },
    stopCheck: () => cancelFlag
  }
  let r = null
  if (canAccel) {
    // GPU 加速路径（L1 WebGPU / L2 GPU.js / L3 Worker，逐级降级；内部 CPU 兜底）
    r = await generateBatch(props.cfg, props.draws, batchOpts)
  } else if (isDirect && play.type === 'duplex') {
    searching.value = false
    playRoll(generateDirectDuplex())
    return
  } else {
    const engine = isDirect ? createDirectPickerEngine(props.cfg) : createPickerEngine(props.cfg, methods.value)
    r = await engine.generateUntil(props.draws, play, targetScore.value, totalCap, (i) => {
      searchingCount.value = i
    }, (rt) => {
      if (violent) collectTicketFreq(rt.ticket)
    }, violent, () => cancelFlag)
  }
  searching.value = false
  stopping.value = false
  if (!r) return
  // 暴力模式 GPU 路径返回的高频统计（key 与 collectTicketFreq 完全一致）
  if (violent && r.freqMap) {
    Object.keys(r.freqMap).forEach((k) => { freq[k] = r.freqMap[k] })
  }
  if (isDirect) {
    const src = r.ticket.type === 'multi' ? r.ticket.tickets : [{ digits: r.ticket.digits, tail: r.ticket.tail }]
    const st = computeDirectStats(props.cfg, props.draws)
    const lines = src.map((t) => ({ digits: t.digits, tail: t.tail, score: st ? scoreDigits(props.cfg, t.digits, t.tail, st) : { total: 0 } }))
    const ticket = directTicketFromLines(src.map((t) => ({ digits: t.digits, tail: t.tail })))
    renderResult({ ...r, ticket, lines, violentMode: violent })
    return
  }
  renderResult({ ...r, violentMode: violent })
}

const searchProgress = computed(() => {
  const cap = isViolent.value ? violentAttempts.value : maxAttempts.value
  return Math.min(100, Math.round((searchingCount.value / Math.max(1, cap)) * 100))
})

function nowTime() {
  const now = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${now.getHours()}:${p(now.getMinutes())}:${p(now.getSeconds())}`
}

function scoreItems(score) {
  return scoreItemsFor(props.cfg, score)
}

/** 当前彩种推荐策略是否包含某策略（reason-line 按推荐策略动态展示统计） */
function hasMethod(m) {
  const rec = props.cfg.recommendMethods
  return !!(rec && rec.includes(m))
}

/** 直位单注的可读统计（reason-line 展示用） */
const directStats = computed(() => {
  const line = firstLine.value
  if (!line || !line.digits) return { digits: 0, odds: 0, bigs: 0, span: 0, form: '—', routeCounts: [0, 0, 0], primeCount: 0 }
  const d = line.digits
  const odds = d.filter((n) => n % 2 === 1).length
  const bigs = d.filter((n) => n >= 5).length
  const sorted = [...d].sort((a, b) => a - b)
  const uniq = new Set(d).size
  const routeCounts = [0, 0, 0]
  d.forEach((n) => routeCounts[n % 3]++)
  return {
    digits: d.length,
    odds,
    bigs,
    span: sorted.length ? sorted[sorted.length - 1] - sorted[0] : 0,
    form: uniq === 1 ? '豹子' : uniq === 2 ? '组三' : '组六',
    routeCounts,
    primeCount: d.filter((n) => [2, 3, 5, 7].includes(n)).length
  }
})

const savedTip = ref('')

/** 将当前 AI 选号结果保存到自选号（与 MyPicks 共用 localStorage 数据，含评分与自动对奖） */
function saveToPicks() {
  if (!result.value) return
  const ticket = { ...result.value.ticket, multiple: multiple.value }
  if (props.cfg.zhuijia) ticket.append = append.value
  let calc, score, checked
  if (props.cfg.playMode === 'direct') {
    calc = calcDirectPlay(props.cfg, ticket)
    const st = computeDirectStats(props.cfg, props.draws)
    const lines = expandDirectTicket(props.cfg, ticket)
    const scored = lines.map((l) => ({ ...l, score: st ? scoreDigits(props.cfg, l.digits, l.tail, st) : { total: 0 } }))
    const totals = scored.map((x) => x.score.total || 0)
    score = {
      total: scored.length ? Math.round(totals.reduce((a, b) => a + b, 0) / scored.length) : 0,
      max: scored.length ? Math.round(Math.max(...totals)) : 0,
      min: scored.length ? Math.round(Math.min(...totals)) : 0,
      count: scored.length,
      lines: scored
    }
  } else {
    calc = calcPlay(props.cfg, ticket)
    score = scoreTicketPlay(props.cfg, props.draws, ticket)
  }
  checked = props.draws && props.draws.length ? checkTicketHistory(props.cfg, ticket, props.draws) : null
  const latest = props.draws && props.draws.length ? props.draws[0] : null
  const hitIssue = checked && checked.draw ? checked.draw.issue : null
  const pick = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ticket,
    savedAt: Date.now(),
    // 唯一不可更改的生成时间戳（历史记录区展示用）
    createStamp: Date.now(),
    combos: calc.combos,
    amount: calc.amount,
    score: { total: score.total, max: score.max, min: score.min, count: score.count, lines: score.lines || [] },
    checkedIssue: hitIssue || (latest ? latest.issue : null),
    status: latest ? 'checked' : 'pending',
    prize: checked
  }
  try {
    const key = 'lottery-picker-mypicks-' + props.cfg.key
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    arr.unshift(pick)
    localStorage.setItem(key, JSON.stringify(arr))
    savedTip.value = `已保存 ${calc.combos} 注 · ¥${calc.amount}，可在「自选号」页查看`
    ElMessage.success('已保存到自选号')
  } catch (e) {
    console.error('保存 AI 选号失败', e)
    ElMessage.error('保存失败，请重试')
  }
}
</script>

<style scoped>
/* 玩法 radio 按钮：浅色下未选中态清晰可点，避免像禁用 */
:deep(.el-radio-button__inner) {
  box-shadow: none;
}
:deep(.el-radio-button:not(.is-active) .el-radio-button__inner) {
  background: #ffffff;
  border-color: var(--accent);
  color: #2a3350;
}
:deep(.el-radio-button:not(.is-active):hover .el-radio-button__inner) {
  background: #fff7e0;
  border-color: var(--accent-strong);
  color: #a87b00;
}
html.dark :deep(.el-radio-button:not(.is-active) .el-radio-button__inner) {
  background: var(--surface-2);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
html.dark :deep(.el-radio-button:not(.is-active):hover .el-radio-button__inner) {
  background: var(--surface-1);
  border-color: var(--accent);
  color: var(--accent);
}

/* 全选 / 不用策略 文字按钮：浅色下加深文字，避免像禁用 */
.ctrl-row :deep(.el-button.is-text) {
  color: #2a3350;
}
.ctrl-row :deep(.el-button.is-text:hover) {
  background: #fffdf4;
  color: var(--accent);
}
html.dark .ctrl-row :deep(.el-button.is-text) {
  color: var(--text-primary);
}
html.dark .ctrl-row :deep(.el-button.is-text:hover) {
  background: var(--surface-1);
  color: var(--accent);
}

/* 次要操作按钮：浅色下金色边框+深色文字，明确可点，避免像禁用 */
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
  --el-button-border-color: var(--accent);
  --el-button-text-color: var(--text-primary);
  --el-button-hover-bg-color: var(--surface-1);
  --el-button-hover-border-color: var(--accent-strong);
  --el-button-hover-text-color: var(--accent-strong);
  box-shadow: none;
}

.ai-controls {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-inset);
  padding: 14px 16px;
  margin-bottom: 14px;
}

.ctrl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.ctrl-row:last-child {
  margin-bottom: 0;
}

.ctrl-row.actions {
  border-top: 1px dashed var(--border);
  padding-top: 12px;
}

.ctrl-label {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}

.amount-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
  font-size: 12px;
  font-weight: 600;
}

/* 自定义号码选择区 */
.lock-row {
  align-items: flex-start;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.lock-pools {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.lock-pool {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.lock-pool-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-right: 2px;
  white-space: nowrap;
}
.pick-ball {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  line-height: 1;
}
.pick-ball-red {
  background: rgba(255, 77, 79, 0.08);
  color: #c0392b;
  border: 1px solid rgba(255, 77, 79, 0.35);
}
.pick-ball-blue {
  background: rgba(64, 158, 255, 0.08);
  color: #2b6cb0;
  border: 1px solid rgba(64, 158, 255, 0.35);
}
.pick-ball:hover {
  transform: scale(1.12);
  border-color: var(--accent);
}
.pick-ball.locked {
  background: linear-gradient(135deg, #f6c453, #e8a838);
  color: #fff;
  border-color: #d4912a;
  box-shadow: 0 0 8px rgba(246, 196, 83, 0.6);
}
html.dark .pick-ball-red {
  color: #ff8a80;
  border-color: rgba(255, 138, 128, 0.4);
}
html.dark .pick-ball-blue {
  color: #82b1ff;
  border-color: rgba(130, 177, 255, 0.4);
}

/* 结果票中用户自定义必选号高亮（金色描边） */
.ball-locked {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  box-shadow: 0 0 8px rgba(246, 196, 83, 0.75);
}

.searching-tip {
  margin: 12px 0;
}

.attempt-line {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.freq-box {
  margin-bottom: 12px;
  border: 1px dashed var(--orange, #f09b2e);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(240, 155, 46, 0.06);
}

.freq-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
}

.freq-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.freq-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--card-bg);
  padding: 3px 10px;
  font-size: 13px;
  color: var(--text-main);
}

.freq-chip b {
  font-weight: 800;
}

.freq-chip .fc-red {
  color: var(--danger, #e64545);
}

.freq-chip .fc-blue {
  color: var(--primary, #3b7cff);
}

.freq-chip .fc-label {
  font-size: 11px;
  color: var(--text-dim);
}

.freq-chip .fc-cnt {
  font-size: 11px;
  color: var(--text-dim);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 1px 6px;
}

.ticket {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 14px 16px;
  margin-bottom: 10px;
}

.ticket-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ticket-balls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.multi-mini {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  margin-right: 4px;
}

.ticket-score {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-left: 8px;
}

.ticket-reason {
  margin-top: 10px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}

.reason-line {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.8;
}

.score-bars {
  margin-top: 8px;
}

.score-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
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

/* 摇奖动画 */
.roll-ticket {
  box-shadow: var(--shadow-glow);
}

.ball.rolling {
  animation: ball-shake 0.09s linear infinite, ball-glow 0.45s ease-in-out infinite alternate;
}

@keyframes ball-shake {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 1px); }
  50% { transform: translate(1px, -1px); }
  75% { transform: translate(-1px, -1px); }
  100% { transform: translate(1px, 1px); }
}

@keyframes ball-glow {
  from { box-shadow: 0 0 4px rgba(246, 196, 83, 0.4); }
  to { box-shadow: 0 0 14px rgba(246, 196, 83, 0.95); }
}
</style>
