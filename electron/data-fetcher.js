'use strict'
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function requestJson(url, referer) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/plain, */*',
          ...(referer ? { Referer: referer } : {})
        },
        timeout: 20000
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error('JSON 解析失败'))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

/** 把省份映射为标准名（处理直辖市/自治区简称） */
function normalizeProvince(name) {
  const map = {
    北京: '北京', 上海: '上海', 天津: '天津', 重庆: '重庆',
    内蒙古: '内蒙古', 广西: '广西', 西藏: '西藏', 宁夏: '宁夏', 新疆: '新疆'
  }
  let n = name.trim()
  n = n.replace(/省$/, '').replace(/市$/, '').replace(/自治区$/, '').replace(/壮族$/, '').replace(/回族$/, '').replace(/维吾尔$/, '')
  if (map[n]) return map[n]
  if (/^(黑龙江|吉林|辽宁|河北|山西|陕西|甘肃|青海|山东|江苏|安徽|浙江|福建|江西|河南|湖北|湖南|广东|海南|四川|贵州|云南|台湾|香港|澳门)$/.test(n)) return n
  return null
}

/** 解析开奖公告文字中的省级中奖分布，如 "北京3注，安徽1注，共4注。" */
function parseProvinceContent(content) {
  if (!content || typeof content !== 'string') return []
  const out = []
  const re = /([\u4e00-\u9fa5]{2,6}?)(\d+)注/g
  let m
  while ((m = re.exec(content)) !== null) {
    const raw = m[1]
    if (/^(共|单|合计|其中)/.test(raw)) continue
    const province = normalizeProvince(raw)
    if (!province) continue
    const count = Math.max(1, Number(m[2]) || 1)
    for (let i = 0; i < count; i++) {
      out.push({ province, city: null, siteNo: '', amount: null })
    }
  }
  return out
}

/** 福彩通用解析：red 逗号分隔数字串；blue 可空；prizegrades 构建 prizeMap */
function parseCwlRows(rows, opts = {}) {
  return rows.map((r) => {
    const red = String(r.red || '').split(',').filter(Boolean).map(Number)
    const prizeMap = {}
    if (Array.isArray(r.prizegrades)) {
      r.prizegrades.forEach((p) => {
        const amt = String(p.typemoney || '').replace(/,/g, '')
        if (p.type !== undefined && p.type !== '' && amt !== '' && Number(amt) > 0) {
          prizeMap[String(p.type)] = Number(amt)
        }
      })
    }
    const blueRaw = r.blue !== undefined && r.blue !== '' ? Number(r.blue) : null
    const hasBlue = opts.hasBlue !== false && blueRaw != null && !isNaN(blueRaw)
    return {
      issue: String(r.code || ''),
      date: String(r.date || '').replace(/\(.*\)$/, '').trim(),
      red,
      blue: hasBlue ? blueRaw : null,
      blue2: null,
      firstPrizePerBet: opts.firstType != null && prizeMap[String(opts.firstType)] != null ? prizeMap[String(opts.firstType)] : null,
      firstPrizeCount: opts.firstType != null && r.prizegrades ? (() => {
        const p = (r.prizegrades || []).find((g) => String(g.type) === String(opts.firstType))
        const c = p && p.typenum !== undefined && p.typenum !== '' ? Number(p.typenum) : null
        return c
      })() : null,
      sales: r.sales ? Number(r.sales) : null,
      pool: r.poolmoney ? Number(r.poolmoney) : null,
      winners: parseProvinceContent(r.content),
      maxPersonalWin: null,
      maxPersonalWinNote: '',
      prizeMap
    }
  })
}

/** 双色球：福彩官网 cwl.gov.cn */
async function fetchSSQ(count = 100) {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, 'https://www.cwl.gov.cn/')
  if (!json || json.state !== 0 || !Array.isArray(json.result)) {
    throw new Error('双色球接口返回结构异常')
  }
  return parseCwlRows(json.result, { firstType: 1 })
}

/** 七乐彩：福彩官网，red=7 基本号，blue=特别号 */
async function fetchQLC(count = 100) {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=qlc&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, 'https://www.cwl.gov.cn/')
  if (!json || json.state !== 0 || !Array.isArray(json.result)) {
    throw new Error('七乐彩接口返回结构异常')
  }
  return parseCwlRows(json.result, { firstType: 1 })
}

/** 快乐8：福彩官网，red=20 个开奖号，prizegrades 为 x1z1~x10z10 全玩法 */
async function fetchKL8(count = 100) {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, 'https://www.cwl.gov.cn/')
  if (!json || json.state !== 0 || !Array.isArray(json.result)) {
    throw new Error('快乐8接口返回结构异常')
  }
  return parseCwlRows(json.result, { firstType: 'x10z10' })
}

/** 福彩3D：福彩官网，red 为逗号分隔的 3 位数字 */
async function fetchFC3D(count = 100) {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&issueCount=${count}&issueStart=&issueEnd=&dayStart=&dayEnd=`
  const json = await requestJson(url, 'https://www.cwl.gov.cn/')
  if (!json || json.state !== 0 || !Array.isArray(json.result)) {
    throw new Error('福彩3D接口返回结构异常')
  }
  return parseCwlRows(json.result, { hasBlue: false }).map((d) => ({
    ...d,
    blue: null,
    blue2: null,
    digits: d.red.slice(0, 3), // 百十个位
    red: [],
    tail: null
  }))
}

/** 体彩通用解析：result 空格分隔数字串 */
function parseSportteryRows(rows) {
  return rows.map((r) => {
    const nums = String(r.lotteryDrawResult || '').trim().split(/\s+/).filter(Boolean).map(Number)
    const prizeMap = {}
    const list = Array.isArray(r.prizeLevelList) ? r.prizeLevelList : []
    let first = null
    list.forEach((p) => {
      const amt = String(p.stakeAmountFormat || '').replace(/,/g, '')
      if (amt !== '' && Number(amt) > 0) prizeMap[String(p.prizeLevel || '')] = Number(amt)
      if (!first && /一等奖/.test(String(p.prizeLevel || ''))) first = p
    })
    return {
      issue: String(r.lotteryDrawNum || ''),
      date: r.lotteryDrawTime || '',
      red: nums,
      blue: null,
      blue2: null,
      firstPrizePerBet: first ? Number(String(first.stakeAmountFormat || '').replace(/,/g, '')) || null : null,
      firstPrizeCount: first ? Number(first.stakeCount) || null : null,
      sales: r.totalSaleAmount ? Number(String(r.totalSaleAmount).replace(/,/g, '')) : null,
      pool: null,
      winners: [],
      maxPersonalWin: null,
      maxPersonalWinNote: '',
      prizeMap
    }
  })
}

/** 排列3：体彩 gameNo=35，result 3 位 */
async function fetchPL3(count = 100) {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=35&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  if (!json || json.errorCode !== '0' || !json.value || !Array.isArray(json.value.list)) {
    throw new Error('排列3接口返回结构异常')
  }
  return parseSportteryRows(json.value.list).map((d) => ({
    ...d,
    digits: d.red.slice(0, 3),
    tail: null
  }))
}

/** 排列5：体彩 gameNo=350133，result 5 位 */
async function fetchPL5(count = 100) {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=350133&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  if (!json || json.errorCode !== '0' || !json.value || !Array.isArray(json.value.list)) {
    throw new Error('排列5接口返回结构异常')
  }
  return parseSportteryRows(json.value.list).map((d) => ({
    ...d,
    digits: d.red.slice(0, 5),
    tail: null
  }))
}

/** 7星彩：体彩 gameNo=04，result 前 6 位 + 尾位(0-14) */
async function fetchQXC(count = 100) {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=04&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  if (!json || json.errorCode !== '0' || !json.value || !Array.isArray(json.value.list)) {
    throw new Error('7星彩接口返回结构异常')
  }
  return parseSportteryRows(json.value.list).map((d) => ({
    ...d,
    digits: d.red.slice(0, 6),
    tail: d.red.length > 6 ? d.red[6] : null
  }))
}

/** 大乐透：体彩官网 webapi.sporttery.cn */
async function fetchDLT(count = 100) {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  const json = await requestJson(url, 'https://static.sporttery.cn/')
  if (!json || json.errorCode !== '0' || !json.value || !Array.isArray(json.value.list)) {
    throw new Error('大乐透接口返回结构异常')
  }
  return parseSportteryRows(json.value.list).map((d) => {
    const nums = d.red
    return {
      ...d,
      red: nums.slice(0, 5),
      blue: nums.length > 5 ? nums[5] : null,
      blue2: nums.length > 6 ? nums[6] : null,
      pool: d.pool
    }
  })
}

const FETCHERS = {
  ssq: fetchSSQ,
  dlt: fetchDLT,
  qlc: fetchQLC,
  kl8: fetchKL8,
  fc3d: fetchFC3D,
  pl3: fetchPL3,
  pl5: fetchPL5,
  qxc: fetchQXC
}

async function fetchGame(game, count = 100) {
  const fn = FETCHERS[game]
  if (!fn) throw new Error(`未知游戏: ${game}`)
  return { game, updatedAt: new Date().toISOString(), draws: await fn(count) }
}

module.exports = { fetchGame, fetchSSQ, fetchDLT, fetchQLC, fetchKL8, fetchFC3D, fetchPL3, fetchPL5, fetchQXC }

// CLI: node electron/data-fetcher.js --game=ssq --count=100 [--out=xxx.json]
if (require.main === module) {
  const args = process.argv.slice(2)
  const getArg = (k) => {
    const eq = args.find((a) => a.startsWith(`${k}=`))
    if (eq) return eq.slice(k.length + 1)
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : null
  }
  const game = getArg('--game') || 'ssq'
  const count = Number(getArg('--count') || 100)
  const out = getArg('--out') || null
  fetchGame(game, count)
    .then((data) => {
      if (out) {
        fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
        fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf-8')
        console.log(`已写入 ${data.draws.length} 期 -> ${out}`)
      } else {
        console.log(JSON.stringify({
          game,
          total: data.draws.length,
          first: data.draws[0],
          last: data.draws[data.draws.length - 1]
        }, null, 2))
      }
    })
    .catch((e) => {
      console.error('抓取失败:', e.message)
      process.exit(1)
    })
}
