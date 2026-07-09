import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'

const mainSource = await readFile(new URL('../frontend-admin/electron/main.cjs', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../frontend-admin/electron/preload.cjs', import.meta.url), 'utf8')
const layoutSource = await readFile(new URL('../frontend-admin/src/layout/index.vue', import.meta.url), 'utf8')
const updaterTypes = await readFile(new URL('../frontend-admin/src/types/desktop-updater.d.ts', import.meta.url), 'utf8')
const adminPackage = JSON.parse(await readFile(new URL('../frontend-admin/package.json', import.meta.url), 'utf8'))

describe('desktop electron shell', () => {
  it('limits the desktop app to one process and at most two managed windows', () => {
    assert.match(mainSource, /MAX_WINDOWS\s*=\s*2/)
    assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/)
    assert.match(mainSource, /app\.on\('second-instance'/)
    assert.match(mainSource, /managedWindows\(\)\.length < MAX_WINDOWS/)
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
    assert.match(adminPackage.scripts['desktop:build'], /--win dir/)
    assert.match(adminPackage.scripts['desktop:dir'], /--win dir/)
    assert.match(adminPackage.scripts['desktop:portable'], /--win portable/)
    assert.equal(adminPackage.build.win.target[0].target, 'dir')
    assert.equal(adminPackage.build.asar, true)
  })

  it('exposes a safe desktop updater bridge for version checks and downloads', () => {
    assert.match(mainSource, /UPDATE_URL_FILE\s*=\s*'update-url\.txt'/)
    assert.match(mainSource, /INJECT_ERP_UPDATE_URL/)
    assert.match(mainSource, /function compareVersions/)
    assert.match(mainSource, /function normalizeUpdateManifest/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:get-version-info'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:check-for-updates'/)
    assert.match(mainSource, /ipcMain\.handle\('desktop:open-update-download'/)
    assert.match(mainSource, /preload:\s*preloadScript/)
    assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('desktopUpdater'/)
    assert.match(preloadSource, /checkForUpdates/)
    assert.match(preloadSource, /openDownload/)
  })

  it('renders desktop version and online update controls in the admin shell', () => {
    assert.match(layoutSource, /desktopUpdaterAvailable/)
    assert.match(layoutSource, /desktopVersionText/)
    assert.match(layoutSource, /checkDesktopUpdate/)
    assert.match(layoutSource, /下载更新/)
    assert.match(layoutSource, /检查更新/)
    assert.match(layoutSource, /ElMessageBox\.confirm/)
    assert.match(layoutSource, /window\.desktopUpdater\.checkForUpdates/)
    assert.match(layoutSource, /window\.desktopUpdater\.openDownload/)
    assert.match(updaterTypes, /interface Window/)
    assert.match(updaterTypes, /desktopUpdater\?: DesktopUpdaterBridge/)
  })
})
