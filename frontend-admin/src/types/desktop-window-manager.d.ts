export type DesktopCloseBehavior = 'ask' | 'hide' | 'quit'

export type DesktopWindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type DesktopManagedWindow = {
  id: number
  slot: number
  title: string
  visible: boolean
  minimized: boolean
  focused: boolean
  bounds: DesktopWindowBounds
}

export type DesktopWindowManagerState = {
  maxWindows: number
  count: number
  canCreate: boolean
  closeBehavior: DesktopCloseBehavior
  windows: DesktopManagedWindow[]
}

export type DesktopWindowManagerResult = {
  ok: boolean
  message?: string
  windowId?: number
  state?: DesktopWindowManagerState
}

export type DesktopWindowManagerBridge = {
  getState: () => Promise<DesktopWindowManagerState>
  createWindow: () => Promise<DesktopWindowManagerResult>
  focusWindow: (windowId: number) => Promise<DesktopWindowManagerResult>
  hideCurrentWindow: () => Promise<DesktopWindowManagerResult>
  showAllWindows: () => Promise<DesktopWindowManagerResult>
  resetLayout: () => Promise<DesktopWindowManagerResult>
  setCloseBehavior: (behavior: DesktopCloseBehavior) => Promise<DesktopWindowManagerResult>
  quitApp: () => Promise<DesktopWindowManagerResult>
  onStateChanged: (callback: (state: DesktopWindowManagerState) => void) => () => void
}

declare global {
  interface Window {
    desktopWindowManager?: DesktopWindowManagerBridge
  }
}

export {}
