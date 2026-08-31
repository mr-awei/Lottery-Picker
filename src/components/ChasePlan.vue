<template>
  <div>
    <div class="card-title">追号计划模拟</div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="基于已加载的官方开奖历史数据，模拟固定号码追号 N 期的投入与回报。仅作历史回测观察，开奖随机独立，不构成投注建议。"
      style="margin-bottom: 14px"
    />

    <div class="panel">
      <template v-if="isDirect">
        <div v-for="(d, di) in cfg.digits" :key="'pos' + di" class="zone-label" :class="{ 'red-label': true }">
          {{ d.label }}
          <el-select v-model="chaseDigits[di]" size="small" style="width: 90px; margin-left: 6px">
            <el-option v-for="v in (d.max + 1)" :key="'p' + di + '_' + (v - 1)" :label="String(v - 1)" :value="v - 1" />
          </el-select>
        </div>
        <template v-if="cfg.tail != null">
          <div class="zone-label blue-label">
            尾位
            <el-select v-model="chaseTail" size="small" style="width: 90px; margin-left: 6px">
              <el-option v-for="v in (cfg.tailMax + 1)" :key="'t' + (v - 1)" :label="String(v - 1)" :value="v - 1" />
            </el-select>
          </div>
        </template>
      </template>
      <template v-else>
        <div class="zone-label red-label">红球（选 {{ cfg.redCount }} 个）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.redMax"
            :key="'r' + n"
            class="pool-btn btn-red"
            :class="{ picked: chaseRed.includes(n) }"
            @click="toggleRed(n)"
          >{{ pad2(n) }}</button>
        </div>
        <div class="zone-label blue-label">蓝球（选 {{ cfg.blueCount }} 个）</div>
        <div class="ball-pool">
          <button
            v-for="n in cfg.blueMax"
            :key="'b' + n"
            class="pool-btn btn-blue"
            :class="{ picked: chaseBlue.includes(n) }"
            @click="toggleBlue(n)"
          >{{ pad2(n) }}</button>
        </div>
      </template>

      <div class="params-row">
        <div class="param-item">
          <span class="param-label">计划期数</span>
          <el-input-number v-model="periods" :min="1" :max="50" size="small" />
        </div>
        <div class="param-item">
          <span class="param-label">起始倍数</span>
          <el-input-number v-model="startMulti" :min="1" :max="99" size="small" />
        </div>
        <div class="param-item">
          <span class="param-label">倍投策略</span>
          <el-select v-model="strategy" size="small" style="width: 140px">
            <el-option label="固定倍数" value="fixed" />
            <el-option label="线性加码(+1)" value="linear" />
            <el-option label="翻倍追号" value="double" />
            <el-option label="阶梯(1-2-4-8)" value="ladder" />
          </el-select>
        </div>
        <div class="param-item">
          <span class="param-label">中奖止盈</span>
          <el-switch v-model="stopOnWin" size="small" />
        </div>
        <el-button type="primary" size="small" :disabled="!validSel" @click="runSim">开始回测</el-button>
        <el-button size="small" @click="randomPick">随机号码</el-button>
      </div>
    </div>

    <template v-if="result.length">
      <div class="summary-row">
        <div class="sum-card">
          <div class="sum-label">回测期数</div>
          <div class="sum-value">{{ result.length }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">总投入</div>
          <div class="sum-value">¥{{ totalCost }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">总奖金</div>
          <div class="sum-value" :class="{ 'sum-win': totalBonus > totalCost, 'sum-lose': totalBonus < totalCost }">¥{{ totalBonus }}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">净收益</div>
          <div class="sum-value" :class="{ 'sum-win': totalBonus - totalCost >= 0, 'sum-lose': totalBonus - totalCost < 0 }">
            {{ totalBonus - totalCost >= 0 ? '+' : '' }}¥{{ totalBonus - totalCost }}
          </div>
        </div>
        <div class="sum-card">
          <div class="sum-label">中奖期数 / 命中</div>
          <div class="sum-value">{{ winCount }} / {{ hitCount }}</div>
        </div>
      </div>

      <div class="sub-title">逐期回测明细</div>
      <div class="table-wrap">
        <table class="mini-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>开奖号码</th>
              <th>倍投</th>
              <th>投入</th>
              <th>中奖等级</th>
              <th>奖金</th>
              <th>累计盈亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in result" :key="i" :class="{ 'row-win': r.bonus > 0 }">
              <td class="dim">{{ r.issue }}</td>
              <td>
                <template v-if="r.drawDigits != null">
                  <span v-for="(dv, di) in r.drawDigits" :key="'d' + di" class="ball ball-red ball-xs">{{ dv }}</span>
                  <span v-if="r.drawTail != null" class="ball ball-blue ball-xs">{{ r.drawTail }}</span>
                </template>
                <template v-else>
                  <span v-for="n in r.drawRed" :key="'r' + n" class="ball ball-red ball-xs">{{ pad2(n) }}</span>
                  <span v-for="(b, bi) in r.drawBlue" :key="'b' + bi" class="ball ball-blue ball-xs">{{ pad2(b) }}</span>
                </template>
              </td>
              <td>{{ r.multiple }}x</td>
              <td>¥{{ r.cost }}</td>
              <td>
                <span v-if="r.bonus > 0" class="prize-tag">{{ r.levelName }}</span>
                <span v-else class="dim">未中奖</span>
              </td>
              <td :class="{ 'cell-win': r.bonus > 0 }">¥{{ r.bonus }}</td>
              <td :class="{ 'cell-win': r.cum >= 0, 'cell-lose': r.cum < 0 }">{{ r.cum >= 0 ? '+' : '' }}¥{{ r.cum }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dim" style="font-size: 12px; margin-top: 8px; line-height: 1.8">
        回测口径：按官方历史开奖逐期核对（最新一期起向前回溯）；奖金按固定奖级规则计算，浮动奖（一等奖/二等奖等按奖池浮动）以单注基础奖金估算。理性购彩，量力而行。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { pad2 } from '../utils/game-config'
import { checkTicket } from '../utils/prize-check'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const isDirect = computed(() => props.cfg.playMode === 'direct')

const chaseRed = ref([])
const chaseBlue = ref([])
const chaseDigits = ref([])
const chaseTail = ref(null)

const periods = ref(10)
const startMulti = ref(1)
const strategy = ref('fixed')
const stopOnWin = ref(true)

const result = ref([])

const validSel = computed(() => {
  if (isDirect.value) {
    return props.cfg.digits.every((d, di) => chaseDigits.value[di] != null)
  }
  return chaseRed.value.length === props.cfg.redCount && chaseBlue.value.length === props.cfg.blueCount
})

function toggleRed(n) {
  chaseRed.value = chaseRed.value.includes(n) ? chaseRed.value.filter((x) => x !== n) : [...chaseRed.value, n].sort((a, b) => a - b)
}
function toggleBlue(n) {
  chaseBlue.value = chaseBlue.value.includes(n) ? chaseBlue.value.filter((x) => x !== n) : [...chaseBlue.value, n].sort((a, b) => a - b)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPick() {
  if (isDirect.value) {
    props.cfg.digits.forEach((d, di) => {
      chaseDigits.value[di] = randInt(0, d.max)
    })
    chaseDigits.value = [...chaseDigits.value]
    if (props.cfg.tail != null) chaseTail.value = randInt(0, props.cfg.tailMax)
    return
  }
  const pool = Array.from({ length: props.cfg.redMax }, (_, i) => i + 1)
  const bpool = Array.from({ length: props.cfg.blueMax }, (_, i) => i + 1)
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
  chaseRed.value = shuffle(pool).slice(0, props.cfg.redCount).sort((a, b) => a - b)
  chaseBlue.value = shuffle(bpool).slice(0, props.cfg.blueCount).sort((a, b) => a - b)
}

function multipleAt(idx) {
  switch (strategy.value) {
    case 'fixed':
      return startMulti.value
    case 'linear':
      return startMulti.value + idx
    case 'double':
      return startMulti.value * Math.pow(2, idx)
    case 'ladder':
      return startMulti.value * [1, 2, 4, 8][idx % 4]
    default:
      return startMulti.value
  }
}

function runSim() {
  if (!validSel.value) {
    ElMessage.warning('请先选择完整的追号号码')
    return
  }
  const ticket = isDirect.value
    ? { type: 'single', digits: chaseDigits.value.map((v) => (v == null ? 0 : v)), tail: chaseTail.value != null ? chaseTail.value : undefined }
    : { type: 'single', red: [...chaseRed.value], blue: [...chaseBlue.value] }

  const total = props.draws.length
  if (!total) {
    ElMessage.warning('暂无开奖数据，请先刷新数据')
    return
  }
  const n = Math.min(periods.value, total)
  const rows = []
  let cum = 0
  let wins = 0
  let hits = 0
  for (let i = 0; i < n; i++) {
    const draw = props.draws[i]
    const multiple = multipleAt(i)
    const cost = multiple * 2
    const t = { ...ticket, multiple }
    const res = checkTicket(props.cfg, t, draw)
    const bonus = res.bonus || 0
    cum += bonus - cost
    if (bonus > 0) wins++
    if (res.level > 0) hits++
    rows.push({
      issue: draw.issue,
      drawRed: draw.red || [],
      drawBlue: [draw.blue, draw.blue2].filter((b) => b != null),
      drawDigits: draw.digits || [],
      drawTail: draw.tail != null ? draw.tail : null,
      multiple,
      cost,
      bonus,
      levelName: res.name || '',
      cum: Math.round(cum * 100) / 100
    })
    // 中奖止盈：命中后停止后续期
    if (stopOnWin.value && bonus > 0) break
  }
  result.value = rows
}

const totalCost = computed(() => result.value.reduce((s, r) => s + r.cost, 0))
const totalBonus = computed(() => result.value.reduce((s, r) => s + r.bonus, 0))
const winCount = computed(() => result.value.filter((r) => r.bonus > 0).length)
const hitCount = computed(() => result.value.filter((r) => r.bonus > 0).length)
</script>

<style scoped>
.panel {
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

.blue-label {
  color: var(--blue);
  margin-top: 14px;
}

.ball-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
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

.btn-red.picked {
  background: radial-gradient(circle at 32% 28%, #ff9a8a, #d92b3f 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(217, 43, 63, 0.5);
}

.btn-blue.picked {
  background: radial-gradient(circle at 32% 28%, #8fc0ff, #1d5ad4 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(29, 90, 212, 0.5);
}

.params-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: 12px;
  color: var(--text-dim);
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.sum-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 12px 14px;
}

.sum-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.sum-value {
  font-size: 20px;
  font-weight: 800;
}

.sum-win {
  color: #67c23a;
}

.sum-lose {
  color: #f56c6c;
}

.sub-title {
  font-size: 13px;
  font-weight: 700;
  margin: 14px 0 8px;
  color: var(--text-main);
}

.table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  overflow: auto;
  max-height: 480px;
  background: var(--card-bg);
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.mini-table th,
.mini-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
  white-space: nowrap;
}

.mini-table th {
  position: sticky;
  top: 0;
  background: var(--card-bg);
  color: var(--text-dim);
  font-weight: 600;
  z-index: 1;
}

.row-win {
  background: rgba(103, 194, 58, 0.06);
}

.cell-win {
  color: #67c23a;
  font-weight: 700;
}

.cell-lose {
  color: #f56c6c;
  font-weight: 700;
}

.prize-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 8px;
  background: rgba(214, 48, 49, 0.12);
  color: var(--red);
  font-size: 11px;
}
</style>
