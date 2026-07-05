<template>
  <el-container class="layout-container">
    <el-aside :width="appStore.sidebarCollapsed ? '64px' : '220px'" class="layout-aside">
      <div class="logo-wrap">
        <div class="logo-mark">注</div>
        <span v-show="!appStore.sidebarCollapsed" class="logo-text">注塑厂管理系统</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        router
        background-color="#182235"
        text-color="#c5cfdb"
        active-text-color="#ffffff"
        class="side-menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><component :is="resolveIcon('HomeFilled')" /></el-icon>
          <template #title>工作台</template>
        </el-menu-item>

        <el-sub-menu v-for="group in routeGroups" :key="group.path" :index="group.path">
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
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">工作台</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute?.meta?.title">{{ currentRoute.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
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
import { useAppStore } from '@/store/app'
import { useUserStore } from '@/store/user'
import { buildRoutePath, routeGroups } from '@/router/route-config'
import { normalizeUnreadNotificationCount } from '@/utils/notification-center'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const unreadCount = ref(0)

const activeMenu = computed(() => route.path)
const currentRoute = computed(() => route)

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

onMounted(() => {
  loadUnreadCount()
  window.addEventListener('notification-updated', handleNotificationUpdated as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('notification-updated', handleNotificationUpdated as EventListener)
})
</script>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
  background: #eef2f6;
}

.layout-aside {
  background: #182235;
  transition: width 0.3s;
  overflow: hidden;
  box-shadow: 1px 0 0 rgba(15, 23, 42, 0.12);
}

.logo-wrap {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #121a2a;
  padding: 0 16px;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  .logo-mark {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 8px;
    background: #12a594;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
  }

  .logo-text {
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    margin-left: 10px;
    white-space: nowrap;
  }
}

.side-menu {
  border-right: none;
  height: calc(100vh - 60px);
  overflow-y: auto;
  background: transparent;
  padding: 18px 8px 20px;

  &::-webkit-scrollbar {
    width: 0;
  }

  :deep(.el-menu-item),
  :deep(.el-sub-menu__title) {
    height: 44px;
    line-height: 44px;
    border-radius: 6px;
    margin: 7px 6px;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  :deep(.el-menu-item:hover),
  :deep(.el-sub-menu__title:hover) {
    background-color: rgba(255, 255, 255, 0.06);
  }

  :deep(.el-menu-item.is-active) {
    background-color: rgba(18, 165, 148, 0.22);
    color: #fff;
    box-shadow: inset 3px 0 0 #12a594;
  }
}

.layout-main {
  flex-direction: column;
  min-width: 0;
}

.layout-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dfe5ec;
  background: rgba(255, 255, 255, 0.96);
  padding: 0 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(10px);
}

.header-left {
  display: flex;
  align-items: center;

  .collapse-btn {
    font-size: 20px;
    cursor: pointer;
    margin-right: 14px;
    color: #526071;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: #0f766e;
      background: #eef7f6;
    }
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;

  .notice-badge {
    cursor: pointer;
  }

  .notice-icon {
    cursor: pointer;
    color: #526071;

    &:hover {
      color: #0f766e;
    }
  }

  .user-info {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #526071;

    .username {
      margin-left: 6px;
      font-size: 14px;
    }

    &:hover {
      color: #0f766e;
    }
  }
}

.layout-content {
  background-color: #eef2f6;
  padding: 16px;
  overflow-y: auto;
  min-width: 0;
}

@media (max-width: 768px) {
  .layout-aside {
    width: 64px !important;
    min-width: 64px !important;
    flex: 0 0 64px !important;
  }

  .logo-wrap {
    padding: 0;
  }

  .logo-text {
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
    min-width: 0;
  }

  .header-left :deep(.el-breadcrumb) {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .header-right {
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
