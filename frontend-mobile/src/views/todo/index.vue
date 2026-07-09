<template>
  <div class="todo-page">
    <van-nav-bar title="待办中心" left-arrow @click-left="router.back()" />

    <div class="summary-line">
      <span>全部 {{ summary.total }}</span>
      <span>离线 {{ summary.offline }}</span>
      <span>报工 {{ summary.report }}</span>
      <span>质检 {{ summary.qc }}</span>
      <span>盘点 {{ summary.inventory }}</span>
      <span>注塑 {{ summary.injection }}</span>
      <span>调拨 {{ summary.transfer }}</span>
    </div>

    <van-tabs v-model:active="activeFilter" class="todo-filter" shrink>
      <van-tab v-for="item in filterOptions" :key="item.name" :title="item.title" :name="item.name" />
    </van-tabs>

    <van-loading v-if="loading" class="page-loading" type="spinner">加载中...</van-loading>
    <van-empty v-else-if="!filteredTodos.length" description="暂无待办任务" />
    <van-cell-group v-else inset>
      <van-cell
        v-for="item in filteredTodos"
        :key="item.id"
        :title="item.title"
        :label="item.description"
        is-link
        @click="router.push(item.route)"
      >
        <template #value>
          <van-tag :type="todoTagType(item.type)" plain>{{ todoTypeText(item.type) }}</van-tag>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getCurrentShiftTasks } from '../../api/prodReport'
import { getPendingQcOrders } from '../../api/qcRecord'
import { getPendingInventoryTasks, getPendingTransfers } from '../../api/stock'
import { getActionableOfflineActionTasks, getActionableOfflineReports } from '../../utils/offline'
import { getInjectionMobileTasks } from '../../api/injection'
import { buildOfflineTaskCenter } from '../../utils/offline-task-center'
import { buildMobileTodoItems, summarizeMobileTodos, type MobileTodoType } from '../../utils/mobile-todo'

type TodoFilter = MobileTodoType | 'all'

const router = useRouter()
const loading = ref(false)
const activeFilter = ref<TodoFilter>('all')
const reportTasks = ref<any[]>([])
const qcOrders = ref<any[]>([])
const inventoryTasks = ref<any[]>([])
const transferTasks = ref<any[]>([])
const injectionTasks = ref<any[]>([])
const offlineReports = ref<any[]>([])
const offlineActionTasks = ref<any[]>([])
const offlineTasks = computed(() => buildOfflineTaskCenter(offlineReports.value, offlineActionTasks.value).tasks)
const todos = computed(() => buildMobileTodoItems({
  reportTasks: reportTasks.value,
  qcOrders: qcOrders.value,
  inventoryTasks: inventoryTasks.value,
  transferTasks: transferTasks.value,
  offlineTasks: offlineTasks.value,
  injectionTasks: injectionTasks.value,
}))
const summary = computed(() => summarizeMobileTodos(todos.value))
const filterOptions: Array<{ name: TodoFilter; title: string }> = [
  { name: 'all', title: '全部' },
  { name: 'offline', title: '离线' },
  { name: 'report', title: '报工' },
  { name: 'qc', title: '质检' },
  { name: 'inventory', title: '盘点' },
  { name: 'injection', title: '注塑' },
  { name: 'transfer', title: '调拨' },
]
const filteredTodos = computed(() =>
  activeFilter.value === 'all' ? todos.value : todos.value.filter((item) => item.type === activeFilter.value)
)

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || res?.records || res || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function todoTagType(value: MobileTodoType) {
  if (value === 'offline') return 'danger'
  if (value === 'qc') return 'success'
  if (value === 'transfer') return 'primary'
  if (value === 'inventory') return 'warning'
  if (value === 'injection') return 'primary'
  return 'default'
}

function todoTypeText(value: MobileTodoType) {
  const labels: Record<MobileTodoType, string> = {
    report: '报工',
    qc: '质检',
    inventory: '盘点',
    transfer: '调拨',
    offline: '离线',
    injection: '注塑',
  }
  return labels[value]
}

async function loadTodos() {
  loading.value = true
  try {
    const [reportRes, qcRes, inventoryRes, transferRes, offlineRes, injectionRes] = await Promise.allSettled([
      getCurrentShiftTasks(),
      getPendingQcOrders(),
      getPendingInventoryTasks(),
      getPendingTransfers(),
      getActionableOfflineReports(),
      getInjectionMobileTasks(),
    ])
    reportTasks.value = reportRes.status === 'fulfilled' ? unwrapRecords(reportRes.value) : []
    qcOrders.value = qcRes.status === 'fulfilled' ? unwrapRecords(qcRes.value) : []
    inventoryTasks.value = inventoryRes.status === 'fulfilled' ? unwrapRecords(inventoryRes.value) : []
    transferTasks.value = transferRes.status === 'fulfilled' ? unwrapRecords(transferRes.value) : []
    offlineReports.value = offlineRes.status === 'fulfilled' ? offlineRes.value : []
    injectionTasks.value = injectionRes.status === 'fulfilled' ? unwrapRecords(injectionRes.value) : []
    offlineActionTasks.value = getActionableOfflineActionTasks()
  } catch (error: any) {
    showToast(error?.message || '待办加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTodos()
})
</script>

<style scoped lang="scss">
.todo-page {
  min-height: 100vh;
  background: #eef2f6;
  padding-bottom: 24px;
}

.summary-line {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 12px;

  span {
    flex: 0 0 auto;
    padding: 6px 10px;
    border: 1px solid #dfe5ec;
    border-radius: 999px;
    background: #fff;
    color: #526071;
    font-size: 12px;
  }
}

.todo-filter {
  margin-bottom: 10px;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
</style>
