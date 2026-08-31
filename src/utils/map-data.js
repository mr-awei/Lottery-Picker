// 中国省级坐标：优先从内置 china.json 的 centroid 提取，缺失时回退到省会坐标
import chinaJson from '../assets/china.json'

const CAPITAL_COORDS = {
  北京: [116.405285, 39.904989],
  天津: [117.190182, 39.125596],
  上海: [121.472644, 31.231706],
  重庆: [106.504962, 29.533155],
  河北: [114.502461, 38.045474],
  山西: [112.549248, 37.857014],
  内蒙古: [111.670801, 40.818311],
  辽宁: [123.429096, 41.796767],
  吉林: [125.3245, 43.886841],
  黑龙江: [126.642464, 45.756967],
  江苏: [118.767413, 32.041544],
  浙江: [120.153576, 30.287459],
  安徽: [117.283042, 31.86119],
  福建: [119.306239, 26.075302],
  江西: [115.892151, 28.676493],
  山东: [117.000923, 36.675807],
  河南: [113.665412, 34.757975],
  湖北: [114.298572, 30.584355],
  湖南: [112.982279, 28.19409],
  广东: [113.280637, 23.125178],
  广西: [108.320004, 22.82402],
  海南: [110.33119, 20.031971],
  四川: [104.065735, 30.659462],
  贵州: [106.713478, 26.578343],
  云南: [102.712251, 25.040609],
  西藏: [91.132212, 29.660361],
  陕西: [108.948024, 34.263161],
  甘肃: [103.823557, 36.058039],
  青海: [101.778916, 36.623178],
  宁夏: [106.278179, 38.46637],
  新疆: [87.617733, 43.792818],
  台湾: [121.509062, 25.044332],
  香港: [114.173355, 22.320048],
  澳门: [113.54909, 22.198951]
}

let centroidMap = null

function buildCentroidMap() {
  if (centroidMap) return centroidMap
  centroidMap = {}
  try {
    ;(chinaJson.features || []).forEach((f) => {
      const name = f.properties && f.properties.name
      const c = f.properties && f.properties.centroid
      if (name && Array.isArray(c) && c.length >= 2) centroidMap[name] = [c[0], c[1]]
    })
  } catch (e) {
    centroidMap = {}
  }
  return centroidMap
}

export function getProvinceCoord(province) {
  if (!province) return null
  const cm = buildCentroidMap()
  if (cm[province]) return cm[province]
  if (CAPITAL_COORDS[province]) return CAPITAL_COORDS[province]
  return null
}

export function hasProvince(province) {
  return !!getProvinceCoord(province)
}

/** 将 winners 按省聚合：{ province, coords, count, draws: [...] } */
export function aggregateWinners(draws) {
  const map = new Map()
  ;(draws || []).forEach((d) => {
    const ws = d.winners || []
    if (!ws.length) return
    const amount = d.firstPrizePerBet || 0
    ws.forEach((w) => {
      const p = w.province
      if (!p) return
      if (!map.has(p)) map.set(p, { province: p, coords: getProvinceCoord(p), count: 0, amount: 0, draws: [] })
      const item = map.get(p)
      item.count++
      item.amount = Math.max(item.amount, amount)
      if (item.draws.length < 12 && !item.draws.find((x) => x.issue === d.issue)) {
        item.draws.push({ issue: d.issue, date: d.date, amount, note: w.siteNo || '' })
      }
    })
  })
  return [...map.values()].filter((x) => x.coords)
}
