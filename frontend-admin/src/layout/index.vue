<template>
  <el-container class="layout-container">
    <el-aside :width="appStore.sidebarCollapsed ? '64px' : '232px'" class="layout-aside">
      <div class="logo-wrap" :class="{ 'is-collapsed': appStore.sidebarCollapsed }">
        <div class="logo-mark">注</div>
        <div v-show="!appStore.sidebarCollapsed" class="logo-copy">
          <span class="logo-text">注塑厂管理系统</span>
          <span class="logo-subtitle">管理端</span>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        router
        background-color="#172033"
        text-color="#c6d0dd"
        active-text-color="#ffffff"
        class="side-menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><component :is="resolveIcon('HomeFilled')" /></el-icon>
          <template #title>工作台</template>
        </el-menu-item>

        <el-sub-menu v-for="group in visibleRouteGroups" :key="group.path" :index="group.path">
          <template #title>
            <el-icon><component :is="resolveIcon(group.icon)" /></el-icon>
            <span>{{ group.title }}</span>
          </template>
          <el-menu-item v-for="item in group.children" :key="item.name" :index="fullPath(group.path, item.path)">
            <el-icon><component :is="resolveIcon(item.icon)" /></el-icon>
            <span>{{ item.title }}</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container class="layout-main">
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="appStore.toggleSidebar">
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <div class="header-context">
            <span class="header-module">{{ currentModuleTitle }}</span>
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{ path: '/dashboard' }">工作台</el-breadcrumb-item>
              <el-breadcrumb-item v-if="currentRoute?.meta?.title">{{ currentRoute.meta.title }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>
        </div>

        <div class="header-right">
          <div class="system-status" aria-label="系统状态">
            <span class="status-pill" :class="{ 'is-warning': !isSupabaseConfigured }">
              <span class="status-dot"></span>
              {{ cloudStatusText }}
            </span>
            <span class="status-pill">管理端</span>
            <el-dropdown
              v-if="desktopWindowManagerAvailable"
              trigger="click"
              @command="handleWindowManagerCommand"
            >
              <el-button class="window-button" size="small" type="primary" link>
                <el-icon><Monitor /></el-icon>
                <span>{{ windowManagerText }}</span>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="create" :disabled="!windowManagerState.canCreate">
                    新建窗口
                  </el-dropdown-item>
                  <el-dropdown-item command="showAll">显示全部窗口</el-dropdown-item>
                  <el-dropdown-item command="hideCurrent">隐藏当前窗口</el-dropdown-item>
                  <el-dropdown-item command="resetLayout">重置窗口布局</el-dropdown-item>
                  <el-dropdown-item divided disabled>窗口列表</el-dropdown-item>
                  <el-dropdown-item
                    v-for="item in windowManagerState.windows"
                    :key="item.id"
                    :command="`focus:${item.id}`"
                  >
                    {{ formatWindowLabel(item) }}
                  </el-dropdown-item>
                  <el-dropdown-item divided disabled>关闭按钮：{{ closeBehaviorText }}</el-dropdown-item>
                  <el-dropdown-item
                    v-for="item in closeBehaviorOptions"
                    :key="item.value"
                    :command="`closeBehavior:${item.value}`"
                  >
                    {{ formatCloseBehaviorOption(item.value, item.label) }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-tooltip v-if="desktopUpdaterAvailable" :content="updateStatusText" placement="bottom">
              <span class="status-pill version-pill" :class="{ 'is-update': updateAvailable }">
                {{ desktopVersionText }}
              </span>
            </el-tooltip>
            <el-button
              v-if="desktopUpdaterAvailable"
              class="update-button"
              size="small"
              :type="updateAvailable ? 'warning' : 'primary'"
              link
              :loading="checkingUpdate"
              @click="checkDesktopUpdate()"
            >
              {{ updateAvailable ? '下载更新' : '检查更新' }}
            </el-button>
            <span class="status-role">{{ currentRoleLabel }}</span>
          </div>

          <el-badge :value="unreadCount" :hidden="!unreadCount" class="notice-badge">
            <el-icon :size="20" class="notice-icon" @click="goNotifications"><Bell /></el-icon>
          </el-badge>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-icon><UserFilled /></el-icon>
              <span class="username">{{ userStore.userInfo.username || '管理员' }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="layout-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Component } from 'vue'
import type { DesktopCloseBehavior, DesktopManagedWindow, DesktopWindowManagerState } from '@/types/desktop-updater'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell,
  Bottom,
  BottomLeft,
  Box,
  Calendar,
  CircleCheck,
  Checked,
  Coin,
  DataAnalysis,
  DataBoard,
  DataLine,
  Document,
  DocumentChecked,
  DocumentCopy,
  EditPen,
  Expand,
  Fold,
  FolderChecked,
  FolderOpened,
  Goods,
  HomeFilled,
  House,
  List,
  Memo,
  Medal,
  Monitor,
  Notebook,
  Odometer,
  PieChart,
  PriceTag,
  Promotion,
  Money,
  Search,
  SetUp,
  Setting,
  ShoppingCart,
  Sort,
  Stamp,
  Tickets,
  Tools,
  TrendCharts,
  User,
  UserFilled,
  Van,
  Wallet,
  WarningFilled,
} from '@element-plus/icons-vue'
import { getUnreadNotificationCount } from '@/api/notification'
import { isSupabaseConfigured } from '@/api/supabaseClient'
import { useAppStore } from '@/store/app'
import { useUserStore } from '@/store/user'
import { buildRoutePath, routeGroups } from '@/router/route-config'
import { normalizeUnreadNotificationCount } from '@/utils/notification-center'
import { canAccessRoles, getStoredUserRoles, normalizeRoles } from '@/utils/role-access'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const unreadCount = ref(0)
const checkingUpdate = ref(false)
const desktopVersion = ref('')
const latestVersion = ref('')
const updateDownloadUrl = ref('')
const updateMessage = ref('')
const updateAvailable = ref(false)
const windowManagerState = ref<DesktopWindowManagerState>({
  maxWindows: 2,
  count: 0,
  canCreate: false,
  closeBehavior: 'ask',
  windows: [],
})
let removeWindowManagerListener: (() => void) | null = null

const roleNameMap: Record<string, string> = {
  admin: '管理员',
  manager: '主管',
  operator: '现场角色',
  field: '现场角色',
  readonly: '只读角色',
  viewer: '只读角色',
}
const closeBehaviorNameMap: Record<DesktopCloseBehavior, string> = {
  ask: '每次询问',
  hide: '隐藏到后台',
  quit: '退出程序',
}
const closeBehaviorOptions: Array<{ value: DesktopCloseBehavior; label: string }> = [
  { value: 'ask', label: '每次询问' },
  { value: 'hide', label: '隐藏到后台' },
  { value: 'quit', label: '退出程序' },
]

const activeMenu = computed(() => route.path)
const currentRoute = computed(() => route)
const accessRoles = computed(() => normalizeRoles([
  ...userStore.roles,
  userStore.userInfo?.role,
  ...getStoredUserRoles(),
]))
const visibleRouteGroups = computed(() =>
  routeGroups
    .map((group) => ({
      ...group,
      children: group.children.filter((item) => canAccessRoles(accessRoles.value, item.roles)),
    }))
    .filter((group) => group.children.length > 0)
)
const currentModuleTitle = computed(() => {
  if (route.path === '/dashboard') return '工作台'
  const matchedGroup = routeGroups.find((group) => route.path === group.path || route.path.startsWith(`${group.path}/`))
  return matchedGroup?.title || String(route.meta?.title || '业务页面')
})
const currentRoleLabel = computed(() => {
  const role = accessRoles.value[0] || userStore.userInfo?.role || ''
  return role ? roleNameMap[role] || role : '未分配角色'
})
const cloudStatusText = computed(() => (isSupabaseConfigured ? '云库已配置' : '云库未配置'))
const desktopUpdaterAvailable = computed(() => Boolean(window.desktopUpdater))
const desktopWindowManagerAvailable = computed(() => Boolean(window.desktopWindowManager))
const desktopVersionText = computed(() => desktopVersion.value ? `v${desktopVersion.value}` : '版本')
const windowManagerText = computed(() =>
  `窗口 ${windowManagerState.value.count}/${windowManagerState.value.maxWindows}`
)
const closeBehaviorText = computed(() => closeBehaviorNameMap[windowManagerState.value.closeBehavior])
const updateStatusText = computed(() => {
  if (updateAvailable.value && latestVersion.value) return `发现新版本 v${latestVersion.value}`
  return updateMessage.value || '点击检查在线更新'
})

const iconMap: Record<string, Component> = {
  Bell,
  Bottom,
  BottomLeft,
  Box,
  Calendar,
  CircleCheck,
  Checked,
  Coin,
  DataAnalysis,
  DataBoard,
  DataLine,
  Document,
  DocumentChecked,
  DocumentCopy,
  EditPen,
  Expand,
  Fold,
  FolderChecked,
  FolderOpened,
  Goods,
  HomeFilled,
  House,
  List,
  Memo,
  Medal,
  Monitor,
  Notebook,
  Odometer,
  PieChart,
  PriceTag,
  Promotion,
  Money,
  Search,
  SetUp,
  Setting,
  ShoppingCart,
  Sort,
  Stamp,
  Tickets,
  Tools,
  TrendCharts,
  User,
  UserFilled,
  Van,
  Wallet,
  WarningFilled,
}

function resolveIcon(name: string): Component {
  return iconMap[name] || HomeFilled
}

function fullPath(groupPath: string, childPath: string) {
  return buildRoutePath(groupPath, childPath)
}

function handleCommand(command: string) {
  if (command === 'logout') {
    userStore.logoutAction()
  }
}

function goNotifications() {
  router.push('/system/notifications')
}

async function loadUnreadCount() {
  try {
    const res: any = await getUnreadNotificationCount()
    unreadCount.value = normalizeUnreadNotificationCount(res.data)
  } catch {
    unreadCount.value = 0
  }
}

function handleNotificationUpdated() {
  loadUnreadCount()
}

async function loadDesktopVersionInfo() {
  if (!window.desktopUpdater) return
  try {
    const info = await window.desktopUpdater.getVersionInfo()
    desktopVersion.value = info.currentVersion || ''
    if (!info.updateUrlConfigured) updateMessage.value = '未配置在线更新地址'
  } catch {
    updateMessage.value = '版本信息读取失败'
  }
}

function updateWindowManagerState(state?: DesktopWindowManagerState) {
  if (!state) return
  windowManagerState.value = state
}

async function loadWindowManagerState() {
  if (!window.desktopWindowManager) return
  try {
    updateWindowManagerState(await window.desktopWindowManager.getState())
  } catch {
    // Window management is desktop-only; web preview can ignore this bridge.
  }
}

function formatWindowLabel(item: DesktopManagedWindow) {
  const slotLabel = item.slot >= 0 ? item.slot + 1 : item.id
  const status = item.focused ? '当前' : item.visible ? '打开' : '隐藏'
  return `窗口 ${slotLabel} · ${status}`
}

function formatCloseBehaviorOption(value: DesktopCloseBehavior, label: string) {
  return windowManagerState.value.closeBehavior === value ? `${label}（当前）` : label
}

async function applyWindowManagerResult(
  action: () => Promise<{ ok: boolean; message?: string; state?: DesktopWindowManagerState }>,
  successMessage = false,
) {
  try {
    const result = await action()
    updateWindowManagerState(result.state)
    if (!result.ok) {
      ElMessage.warning(result.message || '窗口操作失败')
      return
    }
    if (successMessage && result.message) ElMessage.success(result.message)
  } catch {
    ElMessage.warning('窗口管理服务不可用')
  }
}

async function handleWindowManagerCommand(command: string | number | object) {
  if (!window.desktopWindowManager) return
  const text = String(command)
  if (text === 'create') {
    await applyWindowManagerResult(() => window.desktopWindowManager!.createWindow(), true)
    return
  }
  if (text === 'showAll') {
    await applyWindowManagerResult(() => window.desktopWindowManager!.showAllWindows(), true)
    return
  }
  if (text === 'hideCurrent') {
    await applyWindowManagerResult(() => window.desktopWindowManager!.hideCurrentWindow())
    return
  }
  if (text === 'resetLayout') {
    await applyWindowManagerResult(() => window.desktopWindowManager!.resetLayout(), true)
    return
  }
  if (text.startsWith('focus:')) {
    const windowId = Number(text.slice('focus:'.length))
    await applyWindowManagerResult(() => window.desktopWindowManager!.focusWindow(windowId))
    return
  }
  if (text.startsWith('closeBehavior:')) {
    const behavior = text.slice('closeBehavior:'.length) as DesktopCloseBehavior
    await applyWindowManagerResult(() => window.desktopWindowManager!.setCloseBehavior(behavior), true)
  }
}

async function openUpdateDownload() {
  if (!window.desktopUpdater || !updateDownloadUrl.value) return
  const result = await window.desktopUpdater.openDownload(updateDownloadUrl.value)
  if (!result.ok) ElMessage.warning(result.message || '更新下载地址无效')
}

async function confirmUpdateDownload(notes = '') {
  const detail = notes ? `\n\n${notes}` : ''
  try {
    await ElMessageBox.confirm(
      `发现新版本 v${latestVersion.value}，当前版本 v${desktopVersion.value || '-'}。${detail}`,
      '版本更新',
      {
        confirmButtonText: '立即下载',
        cancelButtonText: '稍后',
        type: 'info',
      },
    )
    await openUpdateDownload()
  } catch {
    // User cancelled the update prompt.
  }
}

async function checkDesktopUpdate() {
  if (!window.desktopUpdater) return
  if (updateAvailable.value && updateDownloadUrl.value) {
    await openUpdateDownload()
    return
  }
  checkingUpdate.value = true
  try {
    const result = await window.desktopUpdater.checkForUpdates()
    desktopVersion.value = result.currentVersion || desktopVersion.value
    latestVersion.value = result.latestVersion || ''
    updateDownloadUrl.value = result.downloadUrl || ''
    updateMessage.value = result.message || ''
    updateAvailable.value = Boolean(result.ok && result.updateAvailable && result.downloadUrl)
    if (!result.ok) {
      ElMessage.warning(result.message || '检查更新失败')
      return
    }
    if (updateAvailable.value) {
      await confirmUpdateDownload(result.notes || '')
      return
    }
    ElMessage.success(result.message || '当前已是最新版本')
  } finally {
    checkingUpdate.value = false
  }
}

onMounted(() => {
  loadUnreadCount()
  loadDesktopVersionInfo()
  loadWindowManagerState()
  if (window.desktopWindowManager) {
    removeWindowManagerListener = window.desktopWindowManager.onStateChanged(updateWindowManagerState)
  }
  window.addEventListener('notification-updated', handleNotificationUpdated as EventListener)
})

onUnmounted(() => {
  removeWindowManagerListener?.()
  removeWindowManagerListener = null
  window.removeEventListener('notification-updated', handleNotificationUpdated as EventListener)
})
</script>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
  min-width: 0;
  background: var(--ui-color-bg);
}

.layout-aside {
  background: var(--ui-color-sidebar, #172033);
  transition: width 0.24s ease;
  overflow: hidden;
  box-shadow: 1px 0 0 rgba(15, 23, 42, 0.12);
}

.logo-wrap {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  background-color: #111827;
  padding: 0 16px;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  &.is-collapsed {
    justify-content: center;
    padding: 0;
  }

  .logo-mark {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 8px;
    background: #0f766e;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    font-weight: 800;
  }

  .logo-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .logo-text {
    color: #fff;
    font-size: 15px;
    font-weight: 800;
    line-height: 20px;
    white-space: nowrap;
  }

  .logo-subtitle {
    color: #94a3b8;
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
  }
}

.side-menu {
  height: calc(100vh - 64px);
  padding: 14px 8px 20px;
  overflow-y: auto;
  border-right: none;
  background: transparent;

  &::-webkit-scrollbar {
    width: 0;
  }

  :deep(.el-menu-item),
  :deep(.el-sub-menu__title) {
    height: 42px;
    line-height: 42px;
    margin: 6px 5px;
    border-radius: 8px;
    transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  }

  :deep(.el-menu-item:hover),
  :deep(.el-sub-menu__title:hover) {
    background-color: rgba(255, 255, 255, 0.07);
  }

  :deep(.el-menu-item.is-active) {
    background-color: rgba(15, 118, 110, 0.26);
    color: #fff;
    box-shadow: inset 3px 0 0 #14b8a6;
  }
}

.layout-main {
  min-width: 0;
  flex-direction: column;
}

.layout-header {
  height: var(--ui-header-height, 60px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--ui-color-border);
  background: rgba(255, 255, 255, 0.96);
  padding: 0 18px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(10px);
}

.header-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;

  .collapse-btn {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    border-radius: 8px;
    color: var(--ui-color-text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: #0f766e;
      background: #eef7f6;
    }
  }
}

.header-context {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.header-module {
  max-width: 240px;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-context :deep(.el-breadcrumb) {
  max-width: 420px;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.header-right {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;

  .notice-badge {
    cursor: pointer;
  }

  .notice-icon {
    color: var(--ui-color-text-secondary);
    cursor: pointer;

    &:hover {
      color: #0f766e;
    }
  }

  .user-info {
    min-width: 0;
    display: flex;
    align-items: center;
    color: var(--ui-color-text-secondary);
    cursor: pointer;

    .username {
      max-width: 120px;
      margin-left: 6px;
      overflow: hidden;
      font-size: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:hover {
      color: #0f766e;
    }
  }
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-pill,
.status-role {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ui-color-border-soft);
  border-radius: 999px;
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  padding: 3px 10px;
  white-space: nowrap;
}

.status-pill .status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 999px;
  background: #22c55e;
}

.status-pill.is-warning .status-dot {
  background: #f59e0b;
}

.version-pill {
  cursor: default;
}

.version-pill.is-update {
  border-color: rgba(217, 119, 6, 0.24);
  background: #fff7ed;
  color: #b45309;
}

.update-button {
  height: 26px;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 700;
}

.window-button {
  height: 26px;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 700;

  .el-icon {
    margin-right: 4px;
  }
}

.status-role {
  background: #f8fafc;
  color: #0f766e;
}

.layout-content {
  min-width: 0;
  padding: 16px;
  overflow-y: auto;
  background-color: var(--ui-color-bg);
}

@media (max-width: 960px) {
  .system-status {
    display: none;
  }
}

@media (max-width: 768px) {
  .layout-aside {
    width: 64px !important;
    min-width: 64px !important;
    flex: 0 0 64px !important;
  }

  .logo-wrap {
    padding: 0;
    justify-content: center;
  }

  .logo-copy {
    display: none !important;
  }

  .side-menu {
    padding: 8px 4px 16px;

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      margin: 4px 2px;
      padding: 0 18px !important;
    }

    :deep(.el-menu-item span),
    :deep(.el-sub-menu__title span),
    :deep(.el-sub-menu__icon-arrow) {
      display: none;
    }
  }

  .layout-header {
    padding: 0 10px;
  }

  .header-left {
    flex: 1 1 auto;
    min-width: 0;
  }

  .header-module {
    max-width: 150px;
  }

  .header-context :deep(.el-breadcrumb) {
    max-width: 180px;
  }

  .header-right {
    flex: 0 0 auto;
    gap: 10px;
  }

  .username {
    display: none;
  }

  .layout-content {
    padding: 12px;
  }
}
</style>
