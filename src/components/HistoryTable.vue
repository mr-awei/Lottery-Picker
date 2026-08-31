<template>
  <div>
    <div class="card-title">往期号码（近 {{ draws.length }} 期）</div>
    <el-input
      v-model="keyword"
      placeholder="输入期号搜索，如 2026096"
      clearable
      class="history-search"
    />
    <el-table :data="filtered" size="small" stripe max-height="calc(100vh - 280px)">
      <el-table-column label="期号" width="100">
        <template #default="{ row }">
          <b>{{ row.issue }}</b>
        </template>
      </el-table-column>
      <el-table-column label="开奖日期" width="130">
        <template #default="{ row }">{{ fmtDate(row.date) }}</template>
      </el-table-column>
      <template v-if="cfg.direct">
        <el-table-column label="号码">
          <template #default="{ row }">
            <span v-for="(dg, i) in (row.digits || [])" :key="'d' + i" class="ball ball-red">{{ dg }}</span>
            <template v-if="row.tail != null">
              <span class="tail-sep">·</span>
              <span class="ball ball-blue">{{ row.tail }}</span>
            </template>
          </template>
        </el-table-column>
      </template>
      <template v-else>
        <el-table-column label="红球">
          <template #default="{ row }">
            <span v-for="n in row.red" :key="'r' + n" class="ball ball-red">{{ pad2(n) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="蓝球">
          <template #default="{ row }">
            <span v-for="(b, i) in blueList(row)" :key="'b' + i" class="ball ball-blue">{{ pad2(b) }}</span>
          </template>
        </el-table-column>
      </template>
      <el-table-column label="一等奖单注" width="140">
        <template #default="{ row }">
          <span v-if="row.firstPrizePerBet">¥{{ fmtMoney(row.firstPrizePerBet) }}</span>
          <span v-else class="dim">—</span>
        </template>
      </el-table-column>
      <el-table-column label="一等奖注数" width="120">
        <template #default="{ row }">
          <span v-if="row.firstPrizeCount != null">{{ row.firstPrizeCount }} 注</span>
          <span v-else class="dim">—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { fmtDate, fmtMoney, pad2 } from '../utils/game-config'

const props = defineProps({
  draws: { type: Array, required: true },
  cfg: { type: Object, required: true }
})

const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return props.draws
  return props.draws.filter((d) => String(d.issue).includes(kw))
})

function blueList(row) {
  const list = [row.blue]
  if (row.blue2 != null) list.push(row.blue2)
  return list.filter((b) => b != null)
}
</script>

<style scoped>
.history-search {
  width: 260px;
  max-width: 100%;
  margin-bottom: 14px;
}

.el-table {
  border-radius: var(--r-md);
  overflow: hidden;
}

:deep(.ball) {
  transition: transform var(--dur-fast) var(--ease-out);
}

:deep(.el-table__row:hover .ball) {
  transform: translateY(-2px);
}

.tail-sep {
  margin: 0 4px;
  color: var(--text-muted);
}
</style>
