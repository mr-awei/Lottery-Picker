<template>
  <LotteryBoard :game="'dlt'" :draws="draws" :loading="loading" :error="error" />
</template>

<script setup>
import LotteryBoard from '../components/LotteryBoard.vue'

defineProps({
  draws: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
})
</script>
