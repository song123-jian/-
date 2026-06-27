<template>
  <el-container class="layout-container">
      <!-- 左侧菜单 -->
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
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        class="side-menu"
      >
        <!-- 首页 -->
        <el-menu-item index="/dashboard">
          <el-icon><HomeFilled /></el-icon>
          <template #title>工作台</template>
        </el-menu-item>

        <!-- 基础资料 -->
        <el-sub-menu index="/base">
          <template #title>
            <el-icon><FolderOpened /></el-icon>
            <span>基础资料</span>
          </template>
          <el-menu-item index="/base/users">用户管理</el-menu-item>
          <el-menu-item index="/base/machines">机台管理</el-menu-item>
          <el-menu-item index="/base/warehouses">仓库管理</el-menu-item>
          <el-menu-item index="/base/molds">模具管理</el-menu-item>
          <el-menu-item index="/base/products">产品管理</el-menu-item>
          <el-menu-item index="/base/customers">客户管理</el-menu-item>
          <el-menu-item index="/base/suppliers">供应商管理</el-menu-item>
        </el-sub-menu>

        <!-- 销售管理 -->
        <el-sub-menu index="/sale">
          <template #title>
            <el-icon><ShoppingCart /></el-icon>
            <span>销售管理</span>
          </template>
          <el-menu-item index="/sale/orders">销售订单</el-menu-item>
          <el-menu-item index="/sale/deliveries">发货管理</el-menu-item>
          <el-menu-item index="/sale/payments">回款登记</el-menu-item>
        </el-sub-menu>

        <!-- 生产管理 -->
        <el-sub-menu index="/prod">
          <template #title>
            <el-icon><SetUp /></el-icon>
            <span>生产管理</span>
          </template>
          <el-menu-item index="/prod/orders">生产订单</el-menu-item>
          <el-menu-item index="/prod/reports">报工记录</el-menu-item>
          <el-menu-item index="/prod/downtime">停机记录</el-menu-item>
          <el-menu-item index="/prod/mount-records">上下模记录</el-menu-item>
          <el-menu-item index="/prod/mold-maintenance-records">模具保养记录</el-menu-item>
          <el-menu-item index="/prod/machine-inspection-records">设备点检记录</el-menu-item>
          <el-menu-item index="/prod/warnings">预警中心</el-menu-item>
        </el-sub-menu>
        <!-- 品质管理 -->
        <el-sub-menu index="/qc">
          <template #title>
            <el-icon><CircleCheck /></el-icon>
            <span>品质管理</span>
          </template>
          <el-menu-item index="/qc/records">质检记录</el-menu-item>
          <el-menu-item index="/qc/defect-analysis">不良分析</el-menu-item>
        </el-sub-menu>

        <!-- 仓库管理 -->
        <el-sub-menu index="/stock">
          <template #title>
            <el-icon><House /></el-icon>
            <span>仓库管理</span>
          </template>
          <el-menu-item index="/stock/query">库存查询</el-menu-item>
          <el-menu-item index="/stock/ledger">库存台账</el-menu-item>
          <el-menu-item index="/stock/in-purchase">采购入库</el-menu-item>
          <el-menu-item index="/stock/out-picking">生产领料</el-menu-item>
          <el-menu-item index="/stock/in-produce">成品入库</el-menu-item>
          <el-menu-item index="/stock/out-sale">销售出库</el-menu-item>
          <el-menu-item index="/stock/transfer">仓库调拨</el-menu-item>
          <el-menu-item index="/stock/inventory">盘点单</el-menu-item>
        </el-sub-menu>

        <!-- 工资管理 -->
        <el-sub-menu index="/salary">
          <template #title>
            <el-icon><Wallet /></el-icon>
            <span>工资管理</span>
          </template>
          <el-menu-item index="/salary/prices">计件单价</el-menu-item>
          <el-menu-item index="/salary/daily">日工资</el-menu-item>
          <el-menu-item index="/salary/monthly">月工资汇总</el-menu-item>
          <el-menu-item index="/salary/adjust">奖惩管理</el-menu-item>
        </el-sub-menu>

        <!-- 财务管理 -->
        <el-sub-menu index="/finance">
          <template #title>
            <el-icon><Coin /></el-icon>
            <span>财务管理</span>
          </template>
          <el-menu-item index="/finance/expenses">费用支出</el-menu-item>
          <el-menu-item index="/finance/statements">对账单</el-menu-item>
        </el-sub-menu>

        <!-- 报表中心 -->
        <el-sub-menu index="/report">
          <template #title>
            <el-icon><TrendCharts /></el-icon>
            <span>报表中心</span>
          </template>
          <el-menu-item index="/report/boss-dashboard">老板驾驶舱</el-menu-item>
          <el-menu-item index="/report/production-board">生产看板</el-menu-item>
          <el-menu-item index="/report/quality-board">品质看板</el-menu-item>
        </el-sub-menu>

        <!-- 系统管理 -->
        <el-sub-menu index="/system">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统管理</span>
          </template>
          <el-menu-item index="/system/logs">操作日志</el-menu-item>
          <el-menu-item index="/system/config">系统配置</el-menu-item>
          <el-menu-item index="/system/integration">集成中心</el-menu-item>
          <el-menu-item index="/system/backup">数据备份</el-menu-item>
          <el-menu-item index="/system/notifications">消息中心</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <!-- 右侧内容区 -->
    <el-container class="layout-main">
      <!-- 顶部导航 -->
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="appStore.toggleSidebar">
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <!-- 面包屑导航 -->
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute?.meta?.title">{{ currentRoute.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <!-- 消息铃铛 -->
          <el-badge :value="unreadCount" :hidden="!unreadCount" class="notice-badge">
            <el-icon :size="20" class="notice-icon" @click="goNotifications"><Bell /></el-icon>
          </el-badge>
          <!-- 用户信息 -->
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

      <!-- 主内容区 -->
      <el-main class="layout-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { useUserStore } from '@/store/user'
import { getUnreadNotificationCount } from '@/api/notification'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const unreadCount = ref(0)

// 当前激活的菜单
const activeMenu = computed(() => route.path)
// 当前路由信息
const currentRoute = computed(() => route)

// 下拉菜单命令处理
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
    unreadCount.value = res.data || 0
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
}

.layout-aside {
  background-color: #304156;
  transition: width 0.3s;
  overflow: hidden;
}

.logo-wrap {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #263445;
  padding: 0 16px;
  overflow: hidden;

  .logo-mark {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 8px;
    background-color: #409eff;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
  }

  .logo-text {
    color: #fff;
    font-size: 16px;
    font-weight: bold;
    margin-left: 10px;
    white-space: nowrap;
  }
}

.side-menu {
  border-right: none;
  height: calc(100vh - 60px);
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 0;
  }
}

.layout-main {
  flex-direction: column;
}

.layout-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e6e6e6;
  background: #fff;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.header-left {
  display: flex;
  align-items: center;

  .collapse-btn {
    font-size: 20px;
    cursor: pointer;
    margin-right: 16px;
    color: #606266;

    &:hover {
      color: #409eff;
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
  }

  .user-info {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #606266;

    .username {
      margin-left: 6px;
      font-size: 14px;
    }

    &:hover {
      color: #409eff;
    }
  }
}

.layout-content {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}
</style>
