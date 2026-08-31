'use strict'
const fs = require('fs')
const path = require('path')

/**
 * 本地 JSON 缓存读写
 * 缓存路径: {baseDir}/lottery-data/{game}.json
 * baseDir 由主进程传入 (app.getPath('userData'))；CLI 模式下自动回退到 APPDATA 下项目目录
 */
function getDefaultBaseDir() {
  if (process.env.LOTTERY_DATA_DIR) return process.env.LOTTERY_DATA_DIR
  const appData = process.env.APPDATA || process.cwd()
  return path.join(appData, 'lottery-picker')
}

function storePath(game, baseDir) {
  const dir = baseDir || getDefaultBaseDir()
  return path.join(dir, 'lottery-data', `${game}.json`)
}

function read(game, baseDir) {
  try {
    const p = storePath(game, baseDir)
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function write(game, data, baseDir) {
  const dir = baseDir || getDefaultBaseDir()
  const folder = path.join(dir, 'lottery-data')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(storePath(game, baseDir), JSON.stringify(data), 'utf-8')
  return storePath(game, baseDir)
}

/** 判断缓存是否可用：存在、至少 count 期、且 updatedAt 距今不超过 maxAgeHours */
function isFresh(cache, count, maxAgeHours) {
  if (!cache || !Array.isArray(cache.draws) || cache.draws.length < count) return false
  if (!cache.updatedAt) return false
  const age = Date.now() - new Date(cache.updatedAt).getTime()
  return age >= 0 && age < (maxAgeHours || 24) * 3600 * 1000
}

module.exports = { read, write, isFresh, storePath, getDefaultBaseDir }
