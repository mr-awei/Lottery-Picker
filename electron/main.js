'use strict'
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fetcher = require('./data-fetcher')
const store = require('./data-store')

// GPU 加速：启用 WebGPU（Chromium 需显式开启 unsafe-webgpu 才能使用 compute shader）
app.commandLine.appendSwitch('enable-unsafe-webgpu')

const MAX_DRAWS = 100
const FRESH_HOURS = 24

function userDataDir() {
  return app.getPath('userData')
}

async function ensureData(game, force) {
  const cache = store.read(game, userDataDir())
  if (!force && store.isFresh(cache, MAX_DRAWS, FRESH_HOURS)) {
    return { source: 'cache', ...cache }
  }
  try {
    const data = await fetcher.fetchGame(game, MAX_DRAWS)
    data.updatedAt = new Date().toISOString()
    store.write(game, data, userDataDir())
    return { source: 'fetch', ...data }
  } catch (e) {
    if (cache && Array.isArray(cache.draws) && cache.draws.length > 0) {
      return { source: 'cache-stale', error: e.message, ...cache }
    }
    throw e
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    title: '彩票选号器',
    autoHideMenuBar: true,
    backgroundColor: '#171f34',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('data:get', async (_e, game) => {
    try {
      return { ok: true, ...(await ensureData(game, false)) }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('data:refresh', async (_e, game) => {
    try {
      return { ok: true, ...(await ensureData(game, true)) }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('data:status', (_e, game) => {
    const cache = store.read(game, userDataDir())
    if (!cache || !Array.isArray(cache.draws)) {
      return { ok: true, updatedAt: null, count: 0, missingWinners: 0 }
    }
    const missingWinners = cache.draws.filter((d) => !d.winners || d.winners.length === 0).length
    return {
      ok: true,
      updatedAt: cache.updatedAt || null,
      count: cache.draws.length,
      missingWinners
    }
  })

  // GPU 信息 IPC：返回 Chromium GPU FeatureStatus 与完整 GPU 设备列表（含核显，来自 app.getGPUInfo('complete')）
  ipcMain.handle('gpu:info', async () => {
    try {
      const featureStatus = app.getGPUFeatureStatus()
      // complete 返回全部适配器（含 inactive 的核显/独显），渲染进程据此做手动选择
      // 注意：Electron app.getGPUInfo 的 GPUDevice 字段为 deviceString / type（不是 deviceName / isIntegrated）
      const completeInfo = await app.getGPUInfo('complete')
      const gpuDevices = (completeInfo && Array.isArray(completeInfo.gpuDevice) ? completeInfo.gpuDevice : [])
        .filter((d) => d.type !== 'cpu')
        .map((d, i) => ({
          index: i,
          deviceName: d.deviceString || d.deviceName || '',
          vendorId: d.vendorId || 0,
          deviceId: d.deviceId || 0,
          driverVersion: d.driverVersion || '',
          deviceType: d.type || 'other',
          isIntegrated: d.type === 'integrated-gpu',
          active: !!d.active
        }))
      const basicInfo = await app.getGPUInfo('basic')
      const device = (basicInfo && basicInfo.gpuDevice && basicInfo.gpuDevice[0]) || null
      return {
        ok: true,
        featureStatus,
        gpuDevices,
        gpuDevice: device
          ? {
              deviceName: device.deviceString || device.deviceName || '',
              vendorId: device.vendorId || 0,
              deviceId: device.deviceId || 0,
              driverVersion: device.driverVersion || '',
              deviceType: device.type || 'other',
              isIntegrated: device.type === 'integrated-gpu'
            }
          : null
      }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
