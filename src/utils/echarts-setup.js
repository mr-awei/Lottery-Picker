import * as echarts from 'echarts'

// ECharts 全量引入，桌面应用场景包体可接受，避免按需注册遗漏
export { echarts }

/** 根据当前主题返回图表配色（深色/浅色自适应，随 html.light 类切换） */
export function chartTheme() {
  const light = document.documentElement.classList.contains('light')
  return {
    light,
    text: light ? '#5b6684' : '#a3adc4',
    textStrong: light ? '#1c2540' : '#eef1f8',
    split: light ? 'rgba(20,30,60,0.10)' : 'rgba(255,255,255,0.08)',
    axisLine: light ? 'rgba(20,30,60,0.20)' : 'rgba(255,255,255,0.16)',
    tooltipBg: light ? '#ffffff' : '#1b2540',
    tooltipBorder: light ? '#e5e9f2' : 'rgba(255,255,255,0.12)',
    red: '#ff4d5e',
    redDeep: '#d92b3f',
    redSoft: light ? 'rgba(255,77,94,0.14)' : 'rgba(255,77,94,0.20)',
    blue: light ? '#2f6fed' : '#3d7bff',
    blueDeep: '#1d5ad4',
    blueSoft: light ? 'rgba(47,111,237,0.12)' : 'rgba(61,123,255,0.16)',
    gold: light ? '#e0ad15' : '#f6c453',
    goldSoft: light ? 'rgba(184,134,11,0.14)' : 'rgba(246,196,83,0.18)',
    purple: light ? '#6a45e8' : '#7c5cff',
    gray: light ? '#8b94ab' : '#90a4ae',
    warm: '#ff7043',
    orange: '#e65100',
    green: '#2e7d32',
    teal: '#26a69a',
    cold: light ? '#2f6fed' : '#64b5f6'
  }
}

/** 标准 tooltip 样式（深浅统一） */
export function tipStyle(t) {
  return {
    backgroundColor: t.tooltipBg,
    borderColor: t.tooltipBorder,
    textStyle: { color: t.textStrong, fontSize: 12 }
  }
}

/** 监听主题切换，触发回调重渲染（返回取消函数） */
export function onThemeChange(fn) {
  const handler = () => fn()
  window.addEventListener('lp-theme-change', handler)
  return () => window.removeEventListener('lp-theme-change', handler)
}
