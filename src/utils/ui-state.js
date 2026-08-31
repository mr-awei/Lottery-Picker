// 跨组件共享 UI 状态（切换彩种时保持当前导航页）
import { reactive, ref } from 'vue'

export const uiState = reactive({
  tab: 'history'
})

export function setTab(tab) {
  uiState.tab = tab
}

// 主题状态：light / dark
export const themeState = reactive({
  mode: 'dark'
})

export const theme = ref('dark')

export function applyTheme(mode) {
  const html = document.documentElement
  html.classList.toggle('light', mode === 'light')
  html.classList.toggle('dark', mode !== 'light')
  themeState.mode = mode
  theme.value = mode
  localStorage.setItem('lottery-picker-theme', mode)
  window.dispatchEvent(new CustomEvent('lp-theme-change', { detail: { light: mode === 'light' } }))
}

export function toggleTheme() {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}

export function initTheme() {
  const saved = localStorage.getItem('lottery-picker-theme')
  const mode = saved === 'light' ? 'light' : 'dark'
  applyTheme(mode)
  return mode
}
