<template>
  <div class="home-page">
    <!-- 顶部用户信息 -->
    <div class="user-header">
      <div class="user-info">
        <van-icon name="manager" size="40" color="#fff" />
        <div class="user-detail">
          <span class="user-name">{{ userStore.userName || '操作员' }}</span>
          <span class="user-shift">当前班次：{{ userStore.shift }}</span>
        </div>
      </div>
      <van-badge :content="unreadCount" :max="99" :offset="[-2, 2]">
        <van-icon name="bell" size="22" color="#fff" @click="goNotifications" />
      </van-badge>
    </div>

    <!-- 快捷入口 -->
    <div class="quick-entry">
      <van-grid :column-num="4" :border="false">
        <van-grid-item icon="todo-list-o" text="待办中心" @click="goTo('/m/todo')" />
        <van-grid-item icon="scan" text="扫码报工" @click="goTo('/m/report')" />
        <van-grid-item icon="warning-o" text="异常上报" @click="goTo('/m/abnormal-report')" />
        <van-grid-item icon="replay" text="离线任务" @click="goTo('/m/offline-tasks')" />
        <van-grid-item icon="setting-o" text="注塑专业" @click="goTo('/m/injection')" />
        <van-grid-item icon="chart-trending-o" text="我的产量" @click="goTo('/m/my-output')" />
        <van-grid-item icon="gold-coin-o" text="我的工资" @click="goTo('/m/my-salary')" />
        <van-grid-item icon="checked" text="质检录入" @click="goTo('/m/qc')" />
      </van-grid>
    </div>

    <div class="todo-section">
      <div class="section-title">待办中心 <span>{{ todoSummary.total }} 项</span></div>
      <van-empty v-if="todoItems.length === 0" description="暂无待办任务" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="item in todoItems.slice(0, 5)"
          :key="item.id"
          :title="item.title"
          :label="item.description"
          is-link
          @click="goTo(item.route)"
        >
          <template #value>
            <van-tag :type="item.type === 'offline' ? 'danger' : 'primary'" plain>
              {{ item.type === 'offline' ? '离线' : '待办' }}
            </van-tag>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 当班任务列表 -->
    <div class="task-section">
      <div class="section-title">当班任务</div>
      <van-empty v-if="tasks.length === 0" description="暂无当班任务" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="task in tasks"
          :key="task.workOrderId"
          :title="task.productName"
          :label="task.workOrderNo"
          is-link
          @click="goTo('/m/report')"
        >
          <template #value>
            <van-tag type="primary">{{ task.machineCode }}</van-tag>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 底部导航栏 -->
    <van-tabbar v-model="activeTab" route>
      <van-tabbar-item icon="home-o" to="/m/home">首页</van-tabbar-item>
      <van-tabbar-item icon="scan" to="/m/report">报工</van-tabbar-item>
      <van-tabbar-item icon="chart-trending-o" to="/m/my-output">产量</van-tabbar-item>
      <van-tabbar-item icon="contact" to="/m/my-salary">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../store/user'
import { getCurrentShiftTasks } from '../../api/prodReport'
import { getUnreadCount } from '../../api/notification'
import { getPendingQcOrders } from '../../api/qcRecord'
import { getPendingInventoryTasks, getPendingTransfers } from '../../api/stock'
import { getActionableOfflineActionTasks, getActionableOfflineReports } from '../../utils/offline'
import { getInjectionMobileTasks } from '../../api/injection'
import { buildOfflineTaskCenter } from '../../utils/offline-task-center'
import { buildMobileTodoItems, summarizeMobileTodos } from '../../utils/mobile-todo'

const router = useRouter()
const userStore = useUserStore()
const activeTab = ref(0)
const unreadCount = ref(0)

/** 当班任务列表 */
const tasks = ref<any[]>([])
const qcOrders = ref<any[]>([])
const inventoryTasks = ref<any[]>([])
const transferTasks = ref<any[]>([])
const offlineReports = ref<any[]>([])
const offlineActionTasks = ref<any[]>([])
const injectionTasks = ref<any[]>([])
const offlineTasks = computed(() => buildOfflineTaskCenter(offlineReports.value, offlineActionTasks.value).tasks)
const todoItems = computed(() => buildMobileTodoItems({
  reportTasks: tasks.value,
  qcOrders: qcOrders.value,
  inventoryTasks: inventoryTasks.value,
  transferTasks: transferTasks.value,
  offlineTasks: offlineTasks.value,
  injectionTasks: injectionTasks.value,
}))
const todoSummary = computed(() => summarizeMobileTodos(todoItems.value))

/** 加载当班任务 */
async function loadTasks() {
  try {
    const res = await getCurrentShiftTasks() as any
    tasks.value = res.data || res || []
  } catch {
    tasks.value = []
  }
}

/** 加载未读消息数 */
async function loadUnreadCount() {
  try {
    const res = await getUnreadCount() as any
    const count = res.data ?? res
    unreadCount.value = Number(count) || 0
  } catch {
    unreadCount.value = 0
  }
}

async function loadOfflineTasks() {
  try {
    offlineReports.value = await getActionableOfflineReports()
    offlineActionTasks.value = getActionableOfflineActionTasks()
  } catch {
    offlineReports.value = []
    offlineActionTasks.value = []
  }
}

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || res?.records || res || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

async function loadActionableTasks() {
  const [qcRes, inventoryRes, transferRes] = await Promise.allSettled([
    getPendingQcOrders(),
    getPendingInventoryTasks(),
    getPendingTransfers(),
  ])
  qcOrders.value = qcRes.status === 'fulfilled' ? unwrapRecords(qcRes.value) : []
  inventoryTasks.value = inventoryRes.status === 'fulfilled' ? unwrapRecords(inventoryRes.value) : []
  transferTasks.value = transferRes.status === 'fulfilled' ? unwrapRecords(transferRes.value) : []
}

async function loadInjectionTasks() {
  try {
    const res = await getInjectionMobileTasks() as any
    injectionTasks.value = unwrapRecords(res)
  } catch {
    injectionTasks.value = []
  }
}

/** 跳转页面 */
function goTo(path: string) {
  router.push(path)
}

/** 跳转通知页 */
function goNotifications() {
  router.push('/m/notifications')
}

onMounted(() => {
  loadTasks()
  loadUnreadCount()
  loadOfflineTasks()
  loadActionableTasks()
  loadInjectionTasks()
})
</script>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  background: #eef2f6;
  padding-bottom: 60px;
}

.user-header {
  background: #12313a;
  padding: 18px 16px 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-detail {
  color: #fff;
  display: flex;
  flex-direction: column;

  .user-name {
    font-size: 16px;
    font-weight: 700;
  }

  .user-shift {
    font-size: 12px;
    opacity: 0.82;
    margin-top: 4px;
  }
}

.quick-entry {
  margin: -20px 12px 14px;
  background: #fff;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  padding: 8px 0;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);

  :deep(.van-grid-item__content) {
    padding: 12px 6px;
  }

  :deep(.van-grid-item__icon) {
    color: #0f766e;
    font-size: 24px;
  }

  :deep(.van-grid-item__text) {
    color: #1f2933;
    font-weight: 600;
  }
}

.todo-section,
.task-section {
  padding: 0 12px;

  & + .task-section {
    margin-top: 14px;
  }

  :deep(.van-cell-group--inset) {
    margin: 0;
  }

  :deep(.van-cell) {
    align-items: center;
    padding: 14px 16px;
  }

  :deep(.van-cell__title) {
    min-width: 0;
  }

  :deep(.van-cell__title span) {
    color: #1f2933;
    font-weight: 600;
  }

  :deep(.van-cell__label) {
    color: #64748b;
  }
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  color: #1f2933;
  margin-bottom: 12px;
  padding-left: 4px;

  span {
    color: #526071;
    font-size: 12px;
    font-weight: 500;
  }
}
</style>
