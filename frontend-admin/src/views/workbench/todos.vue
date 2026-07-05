<template>
  <div class="page-container todo-center-page" v-loading="loading">
    <PageHeader title="我的待办中心">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="warning" plain @click="goTo('/prod/warnings')">
        <el-icon><Bell /></el-icon>
        系统预警
      </el-button>
    </PageHeader>

    <section class="kpi-grid">
      <article class="kpi-card">
        <span>全部待办</span>
        <strong>{{ summary.total }}</strong>
        <small>来自工作台、预警和现场异常</small>
      </article>
      <article class="kpi-card kpi-card--danger">
        <span>紧急事项</span>
        <strong>{{ summary.urgent }}</strong>
        <small>严重预警、安灯异常和失败任务</small>
      </article>
      <article class="kpi-card kpi-card--warning">
        <span>处理中</span>
        <strong>{{ summary.processing }}</strong>
        <small>已分派或处理中事项</small>
      </article>
      <article class="kpi-card kpi-card--success">
        <span>可直接处理</span>
        <strong>{{ summary.actionable }}</strong>
        <small>带有业务入口的待办</small>
      </article>
    </section>

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <strong>待办队列</strong>
          <el-segmented v-model="filterLevel" :options="levelOptions" />
        </div>
      </template>

      <el-table :data="filteredTodos" stripe empty-text="暂无待办">
        <el-table-column prop="source" label="来源" width="110">
          <template #default="{ row }">
            <el-tag :type="sourceTag(row.source)" effect="plain">{{ row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="levelTag(row.level)" effect="plain">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="事项" min-width="180" show-overflow-tooltip />
        <el-table-column prop="content" label="说明" min-width="260" show-overflow-tooltip />
        <el-table-column prop="time" label="时间" width="170">
          <template #default="{ row }">{{ row.time || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :disabled="!row.path" @click="goTo(row.path)">处理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { getDashboardData } from '@/api/dashboard'
import { getInjectionList } from '@/api/injection'
import { getWarningList } from '@/api/warning'

type TodoRow = {
  source: string
  level: '紧急' | '一般' | '处理中'
  title: string
  content: string
  time?: string
  path?: string
}

const router = useRouter()
const loading = ref(false)
const rows = ref<TodoRow[]>([])
const filterLevel = ref('全部')
const levelOptions = ['全部', '紧急', '一般', '处理中']

const filteredTodos = computed(() =>
  filterLevel.value === '全部' ? rows.value : rows.value.filter((item) => item.level === filterLevel.value)
)

const summary = computed(() => ({
  total: rows.value.length,
  urgent: rows.value.filter((item) => item.level === '紧急').length,
  processing: rows.value.filter((item) => item.level === '处理中').length,
  actionable: rows.value.filter((item) => item.path).length,
}))

function normalizeDashboardTodos(data: any): TodoRow[] {
  return (data?.todoList || []).map((item: any) => ({
    source: item.type || '工作台',
    level: item.status === '紧急' ? '紧急' : '一般',
    title: item.type || '待办事项',
    content: item.content || '-',
    time: item.time || '',
    path: '/dashboard',
  }))
}

function normalizeWarnings(list: any[]): TodoRow[] {
  return list.slice(0, 20).map((item) => ({
    source: '系统预警',
    level: String(item.level || '').toUpperCase() === 'ERROR' ? '紧急' : '一般',
    title: item.title || item.type || '业务预警',
    content: [item.category, item.targetName, item.message].filter(Boolean).join(' / '),
    time: item.createdAt || item.time || '',
    path: '/prod/warnings',
  }))
}

function normalizeAndon(list: any[]): TodoRow[] {
  return list
    .filter((item) => String(item.status || '').toUpperCase() !== 'CLOSED')
    .slice(0, 20)
    .map((item) => ({
      source: '现场异常',
      level: String(item.status || '').toUpperCase() === 'PROCESSING' ? '处理中' : '紧急',
      title: item.title || item.eventNo || '安灯异常',
      content: item.description || item.sourceType || '-',
      time: item.createdAt || '',
      path: '/injection/andon-event',
    }))
}

async function fetchData() {
  loading.value = true
  try {
    const [dashboardRes, warningRes, andonRes] = await Promise.allSettled([
      getDashboardData(),
      getWarningList(),
      getInjectionList('andon-events', { page: 1, pageSize: 50 }),
    ])
    const dashboardRows = dashboardRes.status === 'fulfilled' ? normalizeDashboardTodos(dashboardRes.value.data || {}) : []
    const warningRows = warningRes.status === 'fulfilled' ? normalizeWarnings(warningRes.value.data?.records || warningRes.value.data || []) : []
    const andonRows = andonRes.status === 'fulfilled' ? normalizeAndon(andonRes.value.data?.records || andonRes.value.data || []) : []
    rows.value = [...andonRows, ...warningRows, ...dashboardRows]
  } finally {
    loading.value = false
  }
}

function sourceTag(source: string) {
  if (source === '现场异常') return 'danger'
  if (source === '系统预警') return 'warning'
  return 'info'
}

function levelTag(level: string) {
  if (level === '紧急') return 'danger'
  if (level === '处理中') return 'warning'
  return 'info'
}

function goTo(path?: string) {
  if (path) router.push(path)
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.kpi-card {
  display: grid;
  gap: 6px;
  min-height: 92px;
  padding: 14px;
  border: 1px solid #dfe5ec;
  border-left: 4px solid #409eff;
  border-radius: 8px;
  background: #fff;
}

.kpi-card--danger { border-left-color: #f56c6c; }
.kpi-card--warning { border-left-color: #e6a23c; }
.kpi-card--success { border-left-color: #67c23a; }

.kpi-card span,
.kpi-card small {
  color: #64748b;
}

.kpi-card strong {
  color: #1f2933;
  font-size: 26px;
  line-height: 30px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
