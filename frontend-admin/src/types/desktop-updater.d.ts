export type DesktopVersionInfo = {
  currentVersion: string
  updateUrlConfigured: boolean
  updateUrl?: string
}

export type DesktopUpdateCheckResult = DesktopVersionInfo & {
  ok: boolean
  updateAvailable: boolean
  latestVersion?: string
  downloadUrl?: string
  releaseDate?: string
  notes?: string
  force?: boolean
  message: string
}

export type DesktopUpdateOpenResult = {
  ok: boolean
  message?: string
}

export type DesktopUpdaterBridge = {
  getVersionInfo: () => Promise<DesktopVersionInfo>
  checkForUpdates: () => Promise<DesktopUpdateCheckResult>
  openDownload: (downloadUrl: string) => Promise<DesktopUpdateOpenResult>
}

declare global {
  interface Window {
    desktopUpdater?: DesktopUpdaterBridge
  }
}

export {}
