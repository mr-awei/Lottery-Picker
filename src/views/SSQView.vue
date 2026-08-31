<template>
  <LotteryBoard :game="'ssq'" :draws="draws" :loading="loading" :error="error" />
</template>

<script setup>
import { computed } from 'vue'
import LotteryBoard from '../components/LotteryBoard.vue'

const props = defineProps({
  draws: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
})
</script>
