import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'

const mainSource = await readFile(new URL('../frontend-admin/electron/main.cjs', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../frontend-admin/electron/preload.cjs', import.meta.url), 'utf8')
const layoutSource = await readFile(new URL('../frontend-admin/src/layout/index.vue', import.meta.url), 'utf8')
const windowManagerTypes = await readFile(new URL('../frontend-admin/src/types/desktop-window-manager.d.ts', import.meta.url), 'utf8')
const adminPackage = JSON.parse(await readFile(new URL('../frontend-admin/package.json', import.meta.url), 'utf8'))
const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

describe('desktop electron shell', () => {
  it('limits the desktop app to one process and at most two managed windows', () => {
    assert.match(mainSource, /MAX_WINDOWS\s*=\s*2/)
    assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/)
    assert.match(mainSource, /app\.on\('second-instance'/)
    assert.match(mainSource, /canCreate: windows\.length < MAX_WINDOWS/)
    assert.match(mainSource, /restoreOrCreateWindow\(\)/)
  })

  it('persists window bounds and remembered close behavior', () => {
    assert.match(mainSource, /WINDOW_STATE_FILE\s*=\s*'desktop-window-state\.json'/)
    assert.match(mainSource, /app\.getPath\('userData'\)/)
    assert.match(mainSource, /win\.getNormalBounds\(\)/)
    assert.match(mainSource, /desktopState\.windows\[slot\]/)
    assert.match(mainSource, /desktopState\.closeBehavior = 'hide'/)
    assert.match(mainSource, /desktopState\.closeBehavior = 'quit'/)
    assert.match(mainSource, /dialog\.showMessageBox/)
  })

  it('keeps hidden windows recoverable and uses faster perceived startup defaults', () => {
    assert.match(mainSource, /new Tray\(appIcon\)/)
    assert.match(mainSource, /win\.once\('ready-to-show'/)
    assert.match(mainSource, /show:\s*false/)
    assert.match(mainSource, /CalculateNativeWinOcclusion/)
    assert.match(mainSource, /backgroundThrottling:\s*false/)
    assert.match(mainSource, /spellcheck:\s*false/)
  })

  it('builds the default no-install EXE as a fast unpacked directory while keeping portable as fallback', () => {
    assert.equal(adminPackage.scripts['desktop:build'], 'npm run desktop:fast')
    assert.equal(adminPackage.scripts['desktop:dir'], 'npm run desktop:fast')
    assert.match(adminPackage.scripts['desktop:fast'], /--win dir/)
    assert.match(adminPackage.scripts['desktop:fast'], /release-delivery\.mjs finalize-fast/)
    assert.match(adminPackage.scripts['desktop:portable'], /--win portable/)
    assert.equal(adminPackage.build.win.target[0].target, 'dir')
    assert.equal(adminPackage.build.asar, true)
    assert.equal(adminPackage.build.compression, 'store')
    assert.equal(adminPackage.build.electronDist, 'node_modules/electron/dist')
    assert.equal(adminPackage.version, rootPackage.version)
    assert.match(adminPackage.version, /^\d+\.\d+\.\d+$/)
  })

  it('removes online update checks, prompts, downloads and renderer bridges', () => {
    assert.doesNotMatch(mainSource, /DEFAULT_UPDATE_URL|UPDATE_URL_FILE|INJECT_ERP_UPDATE_URL/)
    assert.doesNotMatch(mainSource, /fetchUpdateManifest|checkForUpdates|promptForUpdateIfNeeded|registerUpdaterIpc/)
    assert.doesNotMatch(mainSource, /desktop:get-version-info|desktop:check-for-updates|desktop:open-update-download/)
    assert.doesNotMatch(preloadSource, /desktopUpdater|checkForUpdates|openDownload/)
    assert.doesNotMatch(layoutSource, /desktopUpdater|checkDesktopUpdate|下载更新|检查更新/)
    assert.doesNotMatch(windowManagerTypes, /DesktopUpdaterBridge|DesktopUpdateCheckResult|desktopUpdater/)
    assert.match(mainSource, /preload:\s*preloadScript/)
  })

  it('exposes a desktop window manager bridge with bounded window operations', () => {
    assert.match(mainSource, /WINDOW_MANAGER_CHANGED_CHANNEL/)
    assert.match(mainSource, /function windowManagerState/)
    assert.match(mainSource, /function createManagedWindow/)
    assert.match(mainSource, /function resetManagedWindowLayout/)
    assert.match(mainSource, /function setManagedCloseBehavior/)
    assert.match(mainSource, /function registerWindowManagerIpc/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:get-state'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:create'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:focus'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:hide-current'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:show-all'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:reset-layout'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:window-manager:set-close-behavior'/)
    assert.match(mainSource, /窗口管理/)
    assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('desktopWindowManager'/)
    assert.match(preloadSource, /onStateChanged/)
    assert.match(preloadSource, /hideCurrentWindow/)
    assert.match(windowManagerTypes, /DesktopWindowManagerBridge/)
    assert.match(windowManagerTypes, /desktopWindowManager\?: DesktopWindowManagerBridge/)
  })

  it('renders desktop window controls in the admin shell', () => {
    assert.match(layoutSource, /desktopWindowManagerAvailable/)
    assert.match(layoutSource, /windowManagerText/)
    assert.match(layoutSource, /handleWindowManagerCommand/)
    assert.match(layoutSource, /新建窗口/)
    assert.match(layoutSource, /显示全部窗口/)
    assert.match(layoutSource, /隐藏当前窗口/)
    assert.match(layoutSource, /重置窗口布局/)
    assert.match(layoutSource, /关闭按钮：/)
    assert.match(layoutSource, /window\.desktopWindowManager!\.createWindow/)
    assert.match(layoutSource, /window\.desktopWindowManager!\.focusWindow/)
    assert.match(layoutSource, /window\.desktopWindowManager!\.setCloseBehavior/)
  })
})
