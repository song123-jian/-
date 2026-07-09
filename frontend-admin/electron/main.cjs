const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, screen, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !app.isPackaged
const appIcon = path.join(__dirname, '..', 'build', 'icon.ico')
const preloadScript = path.join(__dirname, 'preload.cjs')
const MAX_WINDOWS = 2
const WINDOW_STATE_FILE = 'desktop-window-state.json'
const DEFAULT_WINDOW_BOUNDS = { width: 1440, height: 900 }
const MIN_WINDOW_BOUNDS = { width: 1180, height: 720 }
const CLOSE_BEHAVIORS = new Set(['ask', 'hide', 'quit'])
const UPDATE_URL_FILE = 'update-url.txt'
const UPDATE_TIMEOUT_MS = 10000

let desktopState = { closeBehavior: 'ask', windows: [] }
let tray = null
let isQuitting = false
let saveTimer = null
const windowSlots = new Map()

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function stateFilePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function normalizeUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

function getUpdateFeedUrl() {
  const envUrl = normalizeUrl(process.env.INJECT_ERP_UPDATE_URL)
  if (envUrl) return envUrl
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), UPDATE_URL_FILE),
    path.join(__dirname, '..', UPDATE_URL_FILE),
  ]
  for (const file of candidates) {
    const url = normalizeUrl(readTextFile(file))
    if (url) return url
  }
  return ''
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '')
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(/[.-]/).map((item) => Number.parseInt(item, 10) || 0)
  const rightParts = normalizeVersion(right).split(/[.-]/).map((item) => Number.parseInt(item, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function normalizeUpdateManifest(payload) {
  const latestVersion = normalizeVersion(payload?.version || payload?.latestVersion || payload?.tag_name)
  const downloadUrl = normalizeUrl(payload?.downloadUrl || payload?.download_url || payload?.url || payload?.html_url)
  return {
    latestVersion,
    downloadUrl,
    releaseDate: String(payload?.releaseDate || payload?.published_at || '').trim(),
    notes: String(payload?.notes || payload?.body || payload?.changelog || '').trim(),
    force: Boolean(payload?.force),
  }
}

async function fetchUpdateManifest(updateUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS)
  try {
    const response = await fetch(updateUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) throw new Error(`更新服务返回 ${response.status}`)
    return normalizeUpdateManifest(await response.json())
  } finally {
    clearTimeout(timer)
  }
}

function desktopVersionInfo() {
  const updateUrl = getUpdateFeedUrl()
  return {
    currentVersion: app.getVersion(),
    updateUrlConfigured: Boolean(updateUrl),
    updateUrl,
  }
}

async function checkForUpdates() {
  const base = desktopVersionInfo()
  if (!base.updateUrlConfigured) {
    return {
      ...base,
      ok: false,
      updateAvailable: false,
      message: '未配置在线更新地址。请在 EXE 同目录创建 update-url.txt，写入版本清单 JSON 地址，或设置 INJECT_ERP_UPDATE_URL。',
    }
  }
  try {
    const manifest = await fetchUpdateManifest(base.updateUrl)
    const updateAvailable = manifest.latestVersion
      ? compareVersions(manifest.latestVersion, base.currentVersion) > 0
      : false
    return {
      ...base,
      ...manifest,
      ok: true,
      updateAvailable,
      message: updateAvailable ? '发现新版本' : '当前已是最新版本',
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      updateAvailable: false,
      message: error?.message || '检查更新失败，请检查网络或更新地址。',
    }
  }
}

async function openUpdateDownload(downloadUrl) {
  const url = normalizeUrl(downloadUrl)
  if (!url) return { ok: false, message: '更新下载地址无效。' }
  await shell.openExternal(url)
  return { ok: true }
}

async function promptForUpdateIfNeeded() {
  const result = await checkForUpdates()
  if (!result.ok || !result.updateAvailable || !result.downloadUrl) return
  const windows = managedWindows()
  const owner = windows.find((win) => win.isVisible()) || windows[0]
  const message = `发现新版本 ${result.latestVersion}，当前版本 ${result.currentVersion}。`
  const dialogOptions = {
    type: 'info',
    title: '版本更新',
    message,
    detail: result.notes || '建议下载新版客户端后替换当前目录版程序。',
    buttons: ['立即下载', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }
  const response = owner && !owner.isDestroyed()
    ? await dialog.showMessageBox(owner, dialogOptions)
    : await dialog.showMessageBox(dialogOptions)
  if (response.response === 0) {
    await openUpdateDownload(result.downloadUrl)
  }
}

function safeNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeCloseBehavior(value) {
  return CLOSE_BEHAVIORS.has(value) ? value : 'ask'
}

function normalizeWindowBounds(value) {
  if (!value || typeof value !== 'object') return null
  const width = Math.max(safeNumber(value.width, DEFAULT_WINDOW_BOUNDS.width), MIN_WINDOW_BOUNDS.width)
  const height = Math.max(safeNumber(value.height, DEFAULT_WINDOW_BOUNDS.height), MIN_WINDOW_BOUNDS.height)
  const x = Number(value.x)
  const y = Number(value.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

function loadDesktopState() {
  try {
    const raw = fs.readFileSync(stateFilePath(), 'utf8')
    const parsed = JSON.parse(raw)
    desktopState = {
      closeBehavior: normalizeCloseBehavior(parsed.closeBehavior),
      windows: Array.isArray(parsed.windows)
        ? parsed.windows.map(normalizeWindowBounds).filter(Boolean).slice(0, MAX_WINDOWS)
        : [],
    }
  } catch {
    desktopState = { closeBehavior: 'ask', windows: [] }
  }
}

function saveDesktopState() {
  try {
    fs.mkdirSync(path.dirname(stateFilePath()), { recursive: true })
    fs.writeFileSync(stateFilePath(), `${JSON.stringify(desktopState, null, 2)}\n`, 'utf8')
  } catch {
    // UserData may be read-only in unusual portable locations; ignore and keep the app usable.
  }
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed()) return
  const slot = windowSlots.get(win.id)
  if (slot === undefined) return
  desktopState.windows[slot] = win.getNormalBounds()
}

function saveAllWindowBounds() {
  for (const win of BrowserWindow.getAllWindows()) {
    saveWindowBounds(win)
  }
  saveDesktopState()
}

function scheduleStateSave(win) {
  saveWindowBounds(win)
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveDesktopState()
  }, 250)
}

function intersects(left, right) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function isBoundsVisible(bounds) {
  return screen.getAllDisplays().some((display) => intersects(bounds, display.workArea))
}

function defaultBoundsForSlot(slot) {
  const workArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(DEFAULT_WINDOW_BOUNDS.width, workArea.width)
  const height = Math.min(DEFAULT_WINDOW_BOUNDS.height, workArea.height)
  const offset = slot * 32
  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2) + offset),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2) + offset),
    width,
    height,
  }
}

function boundsForSlot(slot) {
  const saved = normalizeWindowBounds(desktopState.windows[slot])
  return saved && isBoundsVisible(saved) ? saved : defaultBoundsForSlot(slot)
}

function allocateWindowSlot() {
  const usedSlots = new Set(windowSlots.values())
  for (let slot = 0; slot < MAX_WINDOWS; slot += 1) {
    if (!usedSlots.has(slot)) return slot
  }
  return 0
}

function managedWindows() {
  return BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed())
}

function restoreWindow(win) {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function restoreOrCreateWindow() {
  const windows = managedWindows()
  const hiddenWindow = windows.find((win) => !win.isVisible())
  if (hiddenWindow) {
    restoreWindow(hiddenWindow)
    return hiddenWindow
  }
  if (windows.length < MAX_WINDOWS) {
    return createMainWindow()
  }
  restoreWindow(windows[0])
  return windows[0]
}

function showExistingOrCreateWindow() {
  const windows = managedWindows()
  const hiddenWindow = windows.find((win) => !win.isVisible())
  const target = hiddenWindow || windows[0]
  if (target) {
    restoreWindow(target)
    return target
  }
  return createMainWindow()
}

function updateTrayMenu() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showExistingOrCreateWindow() },
    {
      label: '新建窗口',
      enabled: managedWindows().length < MAX_WINDOWS,
      click: () => restoreOrCreateWindow(),
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        isQuitting = true
        saveAllWindowBounds()
        app.quit()
      },
    },
  ]))
}

function createTray() {
  if (tray) return
  tray = new Tray(appIcon)
  tray.setToolTip('注塑ERP管理端')
  tray.on('click', () => restoreOrCreateWindow())
  updateTrayMenu()
}

function registerUpdaterIpc() {
  ipcMain.handle('desktop:get-version-info', () => desktopVersionInfo())
  ipcMain.handle('desktop:check-for-updates', () => checkForUpdates())
  ipcMain.handle('desktop:open-update-download', (_event, downloadUrl) => openUpdateDownload(downloadUrl))
}

function isInternalNavigation(url) {
  if (url.startsWith('file://')) return true
  return Boolean(isDev && process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL))
}

async function askCloseBehavior(win) {
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: '关闭程序',
    message: '关闭窗口时要退出程序还是隐藏到后台？',
    detail: '本次选择会自动记住，下次点击 X 时直接执行。',
    buttons: ['隐藏到后台', '退出程序', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  if (result.response === 0) {
    desktopState.closeBehavior = 'hide'
    saveDesktopState()
    win.hide()
    updateTrayMenu()
    return
  }
  if (result.response === 1) {
    desktopState.closeBehavior = 'quit'
    isQuitting = true
    saveAllWindowBounds()
    app.quit()
  }
}

function handleWindowClose(event, win) {
  saveWindowBounds(win)
  if (isQuitting) {
    saveAllWindowBounds()
    return
  }
  event.preventDefault()
  if (desktopState.closeBehavior === 'quit') {
    isQuitting = true
    saveAllWindowBounds()
    app.quit()
    return
  }
  if (desktopState.closeBehavior === 'hide') {
    win.hide()
    saveDesktopState()
    updateTrayMenu()
    return
  }
  askCloseBehavior(win)
}

function createMainWindow() {
  const slot = allocateWindowSlot()
  const win = new BrowserWindow({
    ...boundsForSlot(slot),
    minWidth: MIN_WINDOW_BOUNDS.width,
    minHeight: MIN_WINDOW_BOUNDS.height,
    title: '注塑ERP管理端',
    icon: appIcon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadScript,
      devTools: isDev,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  windowSlots.set(win.id, slot)

  let didShow = false
  const showWhenReady = () => {
    if (didShow || win.isDestroyed()) return
    didShow = true
    win.show()
    win.focus()
  }
  win.once('ready-to-show', showWhenReady)
  const showFallbackTimer = setTimeout(showWhenReady, 2500)
  if (typeof showFallbackTimer.unref === 'function') showFallbackTimer.unref()

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalNavigation(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.on('move', () => scheduleStateSave(win))
  win.on('resize', () => scheduleStateSave(win))
  win.on('hide', updateTrayMenu)
  win.on('show', updateTrayMenu)
  win.on('close', (event) => handleWindowClose(event, win))
  win.on('closed', () => {
    windowSlots.delete(win.id)
    updateTrayMenu()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  updateTrayMenu()
  return win
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    restoreOrCreateWindow()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.zsc.injecterp.admin')
    Menu.setApplicationMenu(null)
    loadDesktopState()
    registerUpdaterIpc()
    createTray()
    createMainWindow()
    setTimeout(() => {
      promptForUpdateIfNeeded()
    }, 3000)

    app.on('activate', () => {
      showExistingOrCreateWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
    saveAllWindowBounds()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) {
      app.quit()
    }
  })
}
