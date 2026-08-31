// 游戏配置：数字彩玩法参数化差异
// playMode 说明：
//   combo  乐透型（红/蓝双区或单区球池），如双色球/大乐透/七乐彩/快乐8
//   direct 直位数字型（每位 0-9 按位选择），如福彩3D/排列3/排列5/7星彩
export const GAME_CONFIG = {
  ssq: {
    key: 'ssq',
    name: '双色球',
    redLabel: '红球',
    blueLabel: '蓝球',
    redCount: 6,
    redMax: 33,
    blueCount: 1,
    blueMax: 16,
    sumMin: 85,
    sumMax: 120,
    zoneEdges: [11, 22], // 三区分界
    zoneTarget: [2, 2, 2], // 三区目标个数
    zoneNames: ['一区 01-11', '二区 12-22', '三区 23-33'],
    sizeSplit: 16, // 大小分界：>16 为大
    spanMin: 16,
    spanMax: 30,
    drawDaysText: '每周二、四、日 21:15',
    recommendMethods: ['zone', 'odd', 'sum', 'hot', 'size', 'repeat', 'tail']
  },
  dlt: {
    key: 'dlt',
    name: '大乐透',
    redLabel: '前区',
    blueLabel: '后区',
    redCount: 5,
    redMax: 35,
    blueCount: 2,
    blueMax: 12,
    sumMin: 90,
    sumMax: 110,
    zoneEdges: [12, 24],
    zoneTarget: [2, 2, 1],
    zoneNames: ['一区 01-12', '二区 13-24', '三区 25-35'],
    sizeSplit: 17,
    spanMin: 18,
    spanMax: 32,
    zhuijia: true, // 大乐透支持追加投注：每注 +1 元，一/二等奖奖金 ×1.8
    zhuijiaPrice: 1,
    drawDaysText: '每周一、三、六 21:25',
    recommendMethods: ['zone', 'odd', 'sum', 'hot', 'size', 'tail', 'omit']
  },
  qlc: {
    key: 'qlc',
    name: '七乐彩',
    redLabel: '基本号',
    blueLabel: '特别号',
    redCount: 7,
    redMax: 30,
    blueCount: 0, // 七乐彩不选蓝球；接口 blue 字段为特别号，仅参与兑奖
    blueMax: 0,
    special: true,
    sumMin: 85,
    sumMax: 130,
    zoneEdges: [10, 20],
    zoneTarget: [2, 3, 2],
    zoneNames: ['一区 01-10', '二区 11-20', '三区 21-30'],
    sizeSplit: 15,
    spanMin: 18,
    spanMax: 29,
    drawDaysText: '每周一、三、五 21:15',
    recommendMethods: ['zone', 'odd', 'sum', 'cons', 'hot', 'neighbor', 'span']
  },
  kl8: {
    key: 'kl8',
    name: '快乐8',
    redLabel: '号码',
    blueLabel: '',
    redCount: 10, // 默认选十；支持选一~选十（UI 玩法切换）
    redMax: 80,
    blueCount: 0,
    blueMax: 0,
    kl8: true,
    kl8Selects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    sumMin: 350, // 选十和值常见区间（全组合均值 405）
    sumMax: 460,
    zoneEdges: [27, 54],
    zoneTarget: [3, 4, 3],
    zoneNames: ['一区 01-27', '二区 28-54', '三区 55-80'],
    sizeSplit: 40,
    spanMin: 55,
    spanMax: 79,
    drawDaysText: '每日 21:30',
    recommendMethods: ['hot', 'omit', 'odd', 'size', 'span', 'tail', 'repeat', 'sumTail']
  },
  fc3d: {
    key: 'fc3d',
    name: '福彩3D',
    playMode: 'direct',
    direct: true,
    redLabel: '号码',
    blueLabel: '',
    digits: [
      { label: '百位', max: 9 },
      { label: '十位', max: 9 },
      { label: '个位', max: 9 }
    ],
    directTypes: ['direct', 'zuxuan3', 'zuxuan6'],
    sumMin: 3,
    sumMax: 24,
    drawDaysText: '每日 21:15',
    recommendMethods: ['span', 'tail', 'route', 'prime', 'mirror', 'sumTail', 'repeat']
  },
  pl3: {
    key: 'pl3',
    name: '排列3',
    playMode: 'direct',
    direct: true,
    redLabel: '号码',
    blueLabel: '',
    digits: [
      { label: '百位', max: 9 },
      { label: '十位', max: 9 },
      { label: '个位', max: 9 }
    ],
    directTypes: ['direct', 'zuxuan3', 'zuxuan6'],
    sumMin: 3,
    sumMax: 24,
    drawDaysText: '每日 21:25',
    recommendMethods: ['span', 'tail', 'route', 'prime', 'mirror', 'sumTail', 'repeat']
  },
  pl5: {
    key: 'pl5',
    name: '排列5',
    playMode: 'direct',
    direct: true,
    redLabel: '号码',
    blueLabel: '',
    digits: [
      { label: '万位', max: 9 },
      { label: '千位', max: 9 },
      { label: '百位', max: 9 },
      { label: '十位', max: 9 },
      { label: '个位', max: 9 }
    ],
    directTypes: ['direct'],
    sumMin: 10,
    sumMax: 35,
    drawDaysText: '每日 21:25',
    recommendMethods: ['span', 'tail', 'route', 'prime', 'mirror', 'sumTail', 'hot']
  },
  qxc: {
    key: 'qxc',
    name: '7星彩',
    playMode: 'direct',
    direct: true,
    redLabel: '号码',
    blueLabel: '尾位',
    digits: [
      { label: '第1位', max: 9 },
      { label: '第2位', max: 9 },
      { label: '第3位', max: 9 },
      { label: '第4位', max: 9 },
      { label: '第5位', max: 9 },
      { label: '第6位', max: 9 }
    ],
    tailMax: 14, // 最后一位 0-14
    tail: true,
    directTypes: ['direct'],
    sumMin: 3,
    sumMax: 50,
    drawDaysText: '每周二、五、日 21:25',
    recommendMethods: ['tail', 'span', 'route', 'mirror', 'prime', 'sumTail', 'headTail']
  }
}

export const GAME_KEYS = Object.keys(GAME_CONFIG)

/** 彩种分组（用于头部切换按钮分组显示） */
export const GAME_GROUPS = [
  { name: '福彩', items: ['ssq', 'qlc', 'kl8', 'fc3d'] },
  { name: '体彩', items: ['dlt', 'pl3', 'pl5', 'qxc'] }
]

export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 100000000) return (n / 100000000).toFixed(2) + ' 亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  return String(n)
}

export function fmtDate(d) {
  if (!d) return '—'
  return String(d).slice(0, 10)
}

/** 时间戳格式化为 年-月-日 时:分:秒 */
export function fmtStamp(ts) {
  if (!ts) return '—'
  const n = Number(ts)
  if (isNaN(n)) return '—'
  const t = new Date(n)
  const p = (x) => String(x).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}
