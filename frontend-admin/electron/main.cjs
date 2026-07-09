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
const WINDOW_MANAGER_CHANGED_CHANNEL = 'desktop:window-manager:state-changed'

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

function describeManagedWindow(win) {
  const slot = windowSlots.get(win.id)
  return {
    id: win.id,
    slot: slot === undefined ? -1 : slot,
    title: win.getTitle(),
    visible: win.isVisible(),
    minimized: win.isMinimized(),
    focused: win.isFocused(),
    bounds: win.getNormalBounds(),
  }
}

function windowManagerState() {
  const windows = managedWindows()
    .map(describeManagedWindow)
    .sort((left, right) => left.slot - right.slot || left.id - right.id)
  return {
    maxWindows: MAX_WINDOWS,
    count: windows.length,
    canCreate: windows.length < MAX_WINDOWS,
    closeBehavior: desktopState.closeBehavior,
    windows,
  }
}

function notifyWindowManagerChanged() {
  const state = windowManagerState()
  for (const win of managedWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(WINDOW_MANAGER_CHANGED_CHANNEL, state)
    }
  }
  return state
}

function resolveManagedWindow(windowId) {
  const id = Number(windowId)
  if (!Number.isFinite(id)) return null
  return managedWindows().find((win) => win.id === id) || null
}

function windowManagerResult(ok, message = '', extra = {}) {
  updateTrayMenu()
  const state = notifyWindowManagerChanged()
  return { ok, message, state, ...extra }
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

function createManagedWindow() {
  if (managedWindows().length >= MAX_WINDOWS) {
    restoreWindow(managedWindows()[0])
    return windowManagerResult(false, `最多只能打开 ${MAX_WINDOWS} 个窗口。`)
  }
  const win = createMainWindow()
  return windowManagerResult(true, '已新建窗口。', { windowId: win.id })
}

function focusManagedWindow(windowId) {
  const win = resolveManagedWindow(windowId)
  if (!win) return windowManagerResult(false, '窗口不存在或已关闭。')
  restoreWindow(win)
  return windowManagerResult(true, '已切换到指定窗口。', { windowId: win.id })
}

function hideManagedWindow(event, windowId) {
  const win = windowId === undefined
    ? BrowserWindow.fromWebContents(event.sender)
    : resolveManagedWindow(windowId)
  if (!win || win.isDestroyed()) return windowManagerResult(false, '窗口不存在或已关闭。')
  saveWindowBounds(win)
  win.hide()
  return windowManagerResult(true, '已隐藏窗口。', { windowId: win.id })
}

function showAllManagedWindows() {
  const windows = managedWindows()
  if (windows.length === 0) {
    createMainWindow()
  } else {
    windows.forEach(restoreWindow)
  }
  return windowManagerResult(true, '已显示全部窗口。')
}

function resetManagedWindowLayout() {
  const windows = managedWindows().sort((left, right) => {
    const leftSlot = windowSlots.get(left.id) ?? 0
    const rightSlot = windowSlots.get(right.id) ?? 0
    return leftSlot - rightSlot || left.id - right.id
  })
  windows.forEach((win, index) => {
    const slot = windowSlots.get(win.id) ?? index
    win.setBounds(defaultBoundsForSlot(slot), true)
    restoreWindow(win)
    saveWindowBounds(win)
  })
  saveDesktopState()
  return windowManagerResult(true, '已重置窗口布局。')
}

function setManagedCloseBehavior(value) {
  desktopState.closeBehavior = normalizeCloseBehavior(value)
  saveDesktopState()
  return windowManagerResult(true, '已更新关闭按钮行为。')
}

function updateTrayMenu() {
  if (!tray) return
  const state = windowManagerState()
  const windowItems = state.windows.length > 0
    ? state.windows.map((item) => ({
        label: `${item.focused ? '当前 - ' : ''}窗口 ${item.slot + 1}${item.visible ? '' : '（隐藏）'}`,
        click: () => focusManagedWindow(item.id),
      }))
    : [{ label: '暂无窗口', enabled: false }]
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showExistingOrCreateWindow() },
    {
      label: '新建窗口',
      enabled: state.canCreate,
      click: () => restoreOrCreateWindow(),
    },
    {
      label: '窗口管理',
      submenu: [
        ...windowItems,
        { type: 'separator' },
        { label: '显示全部窗口', click: () => showAllManagedWindows() },
        { label: '重置窗口布局', click: () => resetManagedWindowLayout() },
        {
          label: '关闭按钮行为',
          submenu: [
            {
              label: '每次询问',
              type: 'radio',
              checked: desktopState.closeBehavior === 'ask',
              click: () => setManagedCloseBehavior('ask'),
            },
            {
              label: '隐藏到后台',
              type: 'radio',
              checked: desktopState.closeBehavior === 'hide',
              click: () => setManagedCloseBehavior('hide'),
            },
            {
              label: '退出程序',
              type: 'radio',
              checked: desktopState.closeBehavior === 'quit',
              click: () => setManagedCloseBehavior('quit'),
            },
          ],
        },
      ],
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

function registerWindowManagerIpc() {
  ipcMain.handle('desktop:window-manager:get-state', () => windowManagerState())
  ipcMain.handle('desktop:window-manager:create', () => createManagedWindow())
  ipcMain.handle('desktop:window-manager:focus', (_event, windowId) => focusManagedWindow(windowId))
  ipcMain.handle('desktop:window-manager:hide-current', (event) => hideManagedWindow(event))
  ipcMain.handle('desktop:window-manager:show-all', () => showAllManagedWindows())
  ipcMain.handle('desktop:window-manager:reset-layout', () => resetManagedWindowLayout())
  ipcMain.handle('desktop:window-manager:set-close-behavior', (_event, behavior) => setManagedCloseBehavior(behavior))
  ipcMain.handle('desktop:window-manager:quit', () => {
    isQuitting = true
    saveAllWindowBounds()
    app.quit()
    return { ok: true, message: '正在退出程序。' }
  })
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

  const refreshWindowManager = () => {
    updateTrayMenu()
    notifyWindowManagerChanged()
  }

  win.on('move', () => scheduleStateSave(win))
  win.on('resize', () => scheduleStateSave(win))
  win.on('hide', refreshWindowManager)
  win.on('show', refreshWindowManager)
  win.on('focus', refreshWindowManager)
  win.on('blur', refreshWindowManager)
  win.on('minimize', refreshWindowManager)
  win.on('restore', refreshWindowManager)
  win.on('close', (event) => handleWindowClose(event, win))
  win.on('closed', () => {
    windowSlots.delete(win.id)
    refreshWindowManager()
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
    registerWindowManagerIpc()
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
