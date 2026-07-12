<template>
  <div class="page-container workbench-page" v-loading="loading">
    <PageHeader title="工作台">
      <template v-if="isSupabaseConfigured">
        <el-tag effect="plain" type="info">最近刷新 {{ lastUpdated || '-' }}</el-tag>
        <el-button plain @click="fetchData">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="warning" plain @click="goTo('/prod/warnings')">
          <el-icon><Bell /></el-icon>
          预警中心
        </el-button>
      </template>
      <el-tag v-else effect="plain" type="warning">Supabase 未连接</el-tag>
      <el-button plain :icon="Setting" @click="openConfigDialog">配置 Supabase</el-button>
    </PageHeader>

    <section v-if="!isSupabaseConfigured" class="setup-state">
      <div class="setup-hero">
        <div class="setup-copy">
          <p class="setup-eyebrow">Supabase 云数据库未连接</p>
          <h3 class="setup-title">完成云端配置后，工作台会自动切换到实时业务视图</h3>
          <p class="setup-description">
            当前页面只保留配置引导，避免把全量 0 值误判为真实业务数据。点击“填写 Supabase 配置”保存后会自动刷新；完成数据库初始化后即可恢复正常看板。
          </p>
        </div>
        <div class="setup-actions">
          <el-button type="primary" @click="fetchData">
            <el-icon><Refresh /></el-icon>
            重新检查配置
          </el-button>
          <el-button plain @click="openConfigDialog">填写 Supabase 配置</el-button>
        </div>
      </div>

      <div class="setup-grid">
        <article class="setup-card">
          <div class="setup-card-head">
            <span class="setup-step">01</span>
            <h4>补齐管理端环境变量</h4>
          </div>
          <p>可直接点击上方按钮填写并保存，也可在 `frontend-admin/.env.local` 中配置后重启前端。</p>
          <div class="setup-tags">
            <el-tag v-for="item in requiredEnvKeys" :key="item" effect="plain" type="info">{{ item }}</el-tag>
          </div>
        </article>

        <article class="setup-card">
          <div class="setup-card-head">
            <span class="setup-step">02</span>
            <h4>初始化 Supabase 云库</h4>
          </div>
          <p>执行完整云库脚本并部署用户管理函数，确保表结构、Auth 同步和存储桶已经创建。</p>
          <div class="setup-tags">
            <el-tag effect="plain">database/supabase-cloud.sql</el-tag>
            <el-tag effect="plain">supabase/functions/erp-user-admin</el-tag>
          </div>
        </article>

        <article class="setup-card">
          <div class="setup-card-head">
            <span class="setup-step">03</span>
            <h4>验证登录与数据权限</h4>
          </div>
          <p>确认 Supabase Auth 用户、`sys_user` 数据和基础 RLS 策略已准备完成，再重新登录进入工作台。</p>
          <div class="setup-meta">
            <span>当前状态：未检测到 Supabase 连接</span>
            <span>最近检查：{{ lastUpdated || '-' }}</span>
          </div>
        </article>
      </div>
    </section>

    <template v-else>
    <MetricStrip :items="kpiCards" testid="home-kpi-strip" />

    <section class="action-strip">
      <button
        v-for="action in actionItems"
        :key="action.title"
        class="action-btn"
        :class="`action-${action.type}`"
        type="button"
        @click="goTo(action.path)"
      >
        <el-icon class="action-icon">
          <component :is="action.icon" />
        </el-icon>
        <span class="action-text">{{ action.title }}</span>
      </button>
    </section>

    <el-row :gutter="16" class="band-row">
      <el-col :xs="24" :lg="14">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>产量与订单</span>
              <el-tag type="info" effect="plain">今日</el-tag>
            </div>
          </template>

          <div class="chart-grid">
            <section class="chart-panel">
              <div class="chart-title">产量趋势</div>
              <div ref="productionChartRef" class="chart-container"></div>
            </section>
            <section class="chart-panel">
              <div class="chart-title">订单状态</div>
              <div ref="orderChartRef" class="chart-container"></div>
            </section>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card shadow="hover" class="panel-card panel-card-tall">
          <template #header>
            <div class="panel-header">
              <span>设备状态</span>
              <el-tag type="success" effect="plain">{{ productionData.machineStatuses?.length || 0 }} 台</el-tag>
            </div>
          </template>

          <el-table :data="productionData.machineStatuses || []" stripe empty-text="暂无设备状态" class="compact-table">
            <el-table-column prop="machineName" label="设备" min-width="120" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="96">
              <template #default="{ row }">
                <el-tag :type="machineStatusType(row.status)" effect="plain">
                  {{ machineStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="orderNo" label="工单" min-width="120" show-overflow-tooltip />
            <el-table-column prop="productName" label="产品" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="band-row">
      <el-col :xs="24" :lg="14">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>工单进度</span>
              <el-tag type="warning" effect="plain">{{ productionData.orderProgresses?.length || 0 }} 条</el-tag>
            </div>
          </template>

          <el-table :data="productionData.orderProgresses || []" stripe empty-text="暂无工单" class="compact-table">
            <el-table-column prop="orderNo" label="工单号" min-width="130" show-overflow-tooltip />
            <el-table-column prop="productName" label="产品" min-width="130" show-overflow-tooltip />
            <el-table-column label="进度" min-width="220">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress
                    :percentage="clampPercent(row.completionRate)"
                    :stroke-width="10"
                    :show-text="false"
                    :color="progressColor(row.status)"
                  />
                  <span class="progress-text">{{ formatPercent(row.completionRate) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="planQty" label="计划" width="90" />
            <el-table-column prop="completedQty" label="完成" width="90" />
            <el-table-column prop="status" label="状态" width="96">
              <template #default="{ row }">
                <el-tag :type="orderStatusType(row.status)" effect="plain">
                  {{ orderStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>预警队列</span>
              <el-tag :type="warningSummaryTagType" effect="plain">{{ warningSummary.total || 0 }} 条</el-tag>
            </div>
          </template>

          <el-table :data="warningList.slice(0, 6)" stripe empty-text="暂无预警" class="compact-table warning-table">
              <el-table-column prop="category" label="分类" width="86">
                <template #default="{ row }">
                  <el-tag :type="warningCategoryType(row.category)" effect="plain">
                    {{ row.category || '-' }}
                  </el-tag>
                </template>
              </el-table-column>
            <el-table-column prop="level" label="级别" width="86">
              <template #default="{ row }">
                <el-tag :type="warningLevelType(row.level)" effect="plain">
                  {{ warningLevelText(row.level) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="targetName" label="对象" min-width="120" show-overflow-tooltip />
            <el-table-column prop="message" label="说明" min-width="180" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="band-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>班次产量</span>
              <el-tag type="info" effect="plain">不良 {{ totalShiftBadQty }} 件</el-tag>
            </div>
          </template>

          <el-table :data="productionData.shiftOutputs || []" stripe empty-text="暂无班次数据" class="compact-table">
            <el-table-column prop="shift" label="班次" width="100" />
            <el-table-column prop="qty" label="良品" width="120" />
            <el-table-column prop="badQty" label="不良" width="120" />
            <el-table-column label="不良率" min-width="150">
              <template #default="{ row }">
                {{ formatPercent(calcBadRate(row.qty, row.badQty)) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>高频缺陷</span>
              <el-tag type="danger" effect="plain">TOP {{ productionData.topDefects?.length || 0 }}</el-tag>
            </div>
          </template>

          <el-table :data="productionData.topDefects || []" stripe empty-text="暂无缺陷数据" class="compact-table">
            <el-table-column prop="defectType" label="缺陷类型" min-width="180" show-overflow-tooltip />
            <el-table-column prop="qty" label="数量" width="120" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="band-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>待办事项</span>
              <el-tag type="info" effect="plain">{{ todoList.length }} 项</el-tag>
            </div>
          </template>

          <div v-if="todoList.length" class="todo-list">
            <div
              v-for="item in todoList"
              :key="todoKey(item)"
              class="todo-item"
              :class="{ 'todo-item--clickable': Boolean(item.route) }"
              @click="goTodo(item)"
            >
              <div class="todo-main">
                <div class="todo-title-row">
                  <span class="todo-type">{{ todoSourceText(item) }}</span>
                  <el-tag :type="todoStatusType(item.status)" effect="plain" size="small">
                    {{ todoStatusText(item.status) }}
                  </el-tag>
                </div>
                <div class="todo-content">{{ item.title || item.description || '-' }}</div>
                <div v-if="item.description && item.description !== item.title" class="todo-description">
                  {{ item.description }}
                </div>
              </div>
              <div class="todo-time">{{ formatTodoTime(item) }}</div>
            </div>
          </div>
          <el-empty v-else description="暂无待办" />
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="panel-header">
              <span>关键指标明细</span>
              <el-tag type="success" effect="plain">实时</el-tag>
            </div>
          </template>

          <el-table :data="detailRows" stripe empty-text="暂无数据" class="compact-table">
            <el-table-column prop="label" label="指标" min-width="140" />
            <el-table-column prop="value" label="数值" min-width="120" />
            <el-table-column prop="note" label="说明" min-width="200" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    </template>

    <el-dialog
      v-model="configDialogVisible"
      class="supabase-config-dialog"
      title="Supabase 连接配置"
      top="4vh"
      width="min(560px, calc(100vw - 24px))"
      :close-on-click-modal="false"
      @open="loadConfigForm"
    >
      <el-alert
        class="config-dialog-alert"
        type="info"
        show-icon
        :closable="false"
        title="请使用 Supabase 项目设置中的 anon/public key"
        description="部署默认配置会随程序在不同设备生效；本页修改只覆盖当前设备，且仅允许受信任项目的 publishable key。"
      />
      <el-form ref="configFormRef" :model="configForm" :rules="configRules" label-position="top" class="config-form">
        <el-form-item label="项目 URL" prop="url">
          <el-input v-model.trim="configForm.url" placeholder="https://your-project.supabase.co" autocomplete="url" />
        </el-form-item>
        <el-form-item label="Anon / Public Key" prop="anonKey">
          <el-input
            v-model="configForm.anonKey"
            type="password"
            show-password
            placeholder="粘贴 anon public key"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="登录邮箱域名（可选）">
          <el-input v-model.trim="configForm.authEmailDomain" placeholder="your-project-ref.supabase.co" />
        </el-form-item>
        <el-form-item label="存储桶名称（可选）">
          <el-input v-model.trim="configForm.storageBucket" placeholder="erp-files" />
        </el-form-item>
        <el-form-item label="配置确认密码" prop="confirmationPassword">
          <el-input
            v-model="configForm.confirmationPassword"
            type="password"
            show-password
            placeholder="请输入配置确认密码"
            name="supabase-config-confirmation-password"
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="config-dialog-footer">
          <el-button @click="configDialogVisible = false">取消</el-button>
          <el-button
            type="warning"
            plain
            :loading="configResetting"
            :disabled="configSaving"
            @click="handleResetConfig"
          >
            恢复部署默认
          </el-button>
          <el-button
            type="primary"
            :loading="configSaving"
            :disabled="configResetting"
            @click="handleSaveConfig"
          >
            保存并刷新
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { Bell, Checked, CircleCheck, DataLine, EditPen, List, Notebook, Odometer, Refresh, Setting, TrendCharts, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import { getDashboardData, getProductionBoard } from '@/api/dashboard'
import { getDowntimeRecordList } from '@/api/downtime'
import {
  clearSupabaseRuntimeConfig,
  getSupabaseRuntimeConfig,
  isSupabaseConfigured,
  saveSupabaseRuntimeConfig,
  type SupabaseRuntimeConfig,
} from '@/api/supabaseClient'
import { getOeeStats } from '@/api/report'
import { getWarningList, getWarningSummary } from '@/api/warning'
import { formatDate, formatDateTime } from '@/utils'
import {
  getWorkbenchTodoSourceText,
  getWorkbenchTodoStatusText,
  type WorkbenchTodoItem,
} from '@/utils/workbench-todo'

type HomeDashboard = {
  todayProductionQty?: number
  pendingOrderQty?: number
  runningMachineQty?: number
  unreadNotificationQty?: number
  productionTrend?: Array<{
    date?: string
    qty?: number
  }>
  orderStatusDistribution?: Array<{
    status?: string
    label?: string
    count?: number
  }>
  todoList?: Array<Partial<WorkbenchTodoItem> & {
    content?: string
    time?: string
    path?: string
  }>
}

type ProductionBoard = {
  machineStatuses?: Array<{
    machineId?: number
    machineName?: string
    status?: string
    orderNo?: string
    productName?: string
  }>
  orderProgresses?: Array<{
    orderId?: number
    orderNo?: string
    productName?: string
    planQty?: number
    completedQty?: number
    completionRate?: number
    status?: string
  }>
  shiftOutputs?: Array<{
    shift?: string
    qty?: number
    badQty?: number
  }>
  topDefects?: Array<{
    defectType?: string
    qty?: number
  }>
}

type WarningItem = {
  category?: string
  level?: string
  type?: string
  title?: string
  targetName?: string
  value?: number | string
  threshold?: number | string
  message?: string
}

type WarningSummary = {
  total?: number
  warning?: number
  error?: number
  stock?: number
  mold?: number
}

type OeeResponse = {
  oee?: number
  timeAvailability?: number
  performanceRate?: number
  qualityRate?: number
}

type DowntimeRecord = {
  durationMinutes?: number | null
  startTime?: string | null
  endTime?: string | null
}

type TodoItem = NonNullable<HomeDashboard['todoList']>[number]

const router = useRouter()
const loading = ref(false)
const lastUpdated = ref('')
const configSaving = ref(false)
const configResetting = ref(false)
const configDialogVisible = ref(false)
const configFormRef = ref<FormInstance>()

const configForm = ref<SupabaseRuntimeConfig & { confirmationPassword: string }>({
  url: '',
  anonKey: '',
  authEmailDomain: '',
  storageBucket: '',
  confirmationPassword: '',
})

const configRules: FormRules = {
  url: [
    { required: true, message: '请输入 Supabase 项目 URL', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          const parsedUrl = new URL(String(value || '').trim())
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error()
          callback()
        } catch {
          callback(new Error('请输入有效的 http 或 https 地址'))
        }
      },
      trigger: 'blur',
    },
  ],
  anonKey: [{ required: true, message: '请输入 anon/public key', trigger: 'blur' }],
  confirmationPassword: [{ required: true, message: '请输入配置确认密码', trigger: 'blur' }],
}

const homeData = ref<HomeDashboard>({})
const productionData = ref<ProductionBoard>({})
const warningList = ref<WarningItem[]>([])
const warningSummary = ref<WarningSummary>({})
const oeeData = ref<OeeResponse>({})
const downtimeMinutes = ref(0)
const todoList = computed(() => homeData.value.todoList || [])

const productionChartRef = ref<HTMLElement | null>(null)
const orderChartRef = ref<HTMLElement | null>(null)
let productionChart: echarts.ECharts | null = null
let orderChart: echarts.ECharts | null = null

const actionItems = [
  { title: '报工', path: '/prod/reports', icon: EditPen, type: 'primary' },
  { title: '工单', path: '/prod/orders', icon: List, type: 'success' },
  { title: '停机', path: '/prod/downtime', icon: WarningFilled, type: 'warning' },
  { title: '模具保养', path: '/prod/mold-maintenance-records', icon: Notebook, type: 'info' },
  { title: '质检', path: '/qc/records', icon: Checked, type: 'danger' },
  { title: '预警中心', path: '/prod/warnings', icon: Bell, type: 'warning' },
] as const

const orderColors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#8b5cf6']
const requiredEnvKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_AUTH_EMAIL_DOMAIN', 'VITE_SUPABASE_STORAGE_BUCKET']

function loadConfigForm() {
  configForm.value = {
    ...getSupabaseRuntimeConfig(),
    confirmationPassword: '',
  }
}

function openConfigDialog() {
  loadConfigForm()
  configDialogVisible.value = true
}

async function handleSaveConfig() {
  const valid = await configFormRef.value?.validate().catch(() => false)
  if (!valid) return

  configSaving.value = true
  try {
    await saveSupabaseRuntimeConfig(configForm.value, configForm.value.confirmationPassword)
    ElMessage.success('Supabase 配置已保存，页面即将刷新')
    window.setTimeout(() => window.location.reload(), 300)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Supabase 配置保存失败')
  } finally {
    configSaving.value = false
  }
}

async function handleResetConfig() {
  if (!configForm.value.confirmationPassword) {
    await configFormRef.value?.validateField('confirmationPassword').catch(() => undefined)
    return
  }

  configResetting.value = true
  try {
    await clearSupabaseRuntimeConfig(configForm.value.confirmationPassword)
    ElMessage.success('已恢复部署默认 Supabase 配置，页面即将刷新')
    window.setTimeout(() => window.location.reload(), 300)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Supabase 配置恢复失败')
  } finally {
    configResetting.value = false
  }
}

function numberText(value?: number | string | null) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function percentText(value?: number | string | null) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatPercent(value?: number | string | null) {
  return percentText(value)
}

function clampPercent(value?: number | string | null) {
  const percent = Number(value || 0)
  return Math.max(0, Math.min(100, percent))
}

function calcCompletionRate() {
  const list = productionData.value.orderProgresses || []
  const plan = list.reduce((sum, item) => sum + Number(item.planQty || 0), 0)
  const completed = list.reduce((sum, item) => sum + Number(item.completedQty || 0), 0)
  return plan > 0 ? (completed / plan) * 100 : 0
}

function calcBadRate(qty?: number, badQty?: number) {
  const total = Number(qty || 0)
  const bad = Number(badQty || 0)
  return total > 0 ? (bad / total) * 100 : 0
}

function calcDowntimeMinutes(records: DowntimeRecord[]) {
  return records.reduce((sum, item) => {
    if (typeof item.durationMinutes === 'number') {
      return sum + item.durationMinutes
    }
    if (item.startTime && item.endTime) {
      const start = new Date(item.startTime).getTime()
      const end = new Date(item.endTime).getTime()
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        return sum + Math.round((end - start) / 60000)
      }
    }
    return sum
  }, 0)
}

function todoKey(item: TodoItem) {
  return `${item.id || item.type || 'todo'}-${item.dueAt || item.time || item.createdAt || ''}-${item.title || item.content || ''}`
}

function warningLevelText(level?: string) {
  if (level === 'ERROR') return '严重'
  if (level === 'WARNING') return '预警'
  return level || '-'
}

function warningLevelType(level?: string) {
  if (level === 'ERROR') return 'danger'
  if (level === 'WARNING') return 'warning'
  return 'info'
}

function warningCategoryType(category?: string) {
  const normalized = String(category || '')
  if (normalized.includes('模具')) return 'warning'
  if (normalized.includes('库存')) return 'danger'
  if (normalized.includes('设备') || normalized.includes('生产')) return 'info'
  return 'info'
}

function todoStatusText(status?: string) {
  if (status === 'URGENT' || status === 'PROCESSING' || status === 'PENDING') return getWorkbenchTodoStatusText(status)
  if (status === '紧急') return '紧急'
  if (status === '一般') return '一般'
  return status || '待办'
}

function todoStatusType(status?: string) {
  if (status === 'URGENT') return 'danger'
  if (status === 'PROCESSING') return 'warning'
  if (status === 'PENDING') return 'info'
  if (status === '紧急') return 'danger'
  if (status === '一般') return 'warning'
  return 'info'
}

function todoSourceText(item: TodoItem) {
  return getWorkbenchTodoSourceText(item.source || item.type || 'dashboard')
}

function formatTodoTime(item: TodoItem) {
  const value = item.dueAt || item.createdAt || item.time
  return value ? formatDateTime(value) : '-'
}

function goTodo(item: TodoItem) {
  const target = item.route || item.path
  if (target) goTo(target)
}

function orderStatusText(status?: string) {
  const map: Record<string, string> = {
    SCHEDULED: '待排产',
    RUNNING: '生产中',
    PAUSED: '已暂停',
    FINISHED: '已完成',
    CANCELLED: '已取消',
  }
  return map[status || ''] || status || '-'
}

function orderStatusType(status?: string) {
  const map: Record<string, string> = {
    SCHEDULED: 'warning',
    RUNNING: 'success',
    PAUSED: 'danger',
    FINISHED: 'info',
    CANCELLED: 'info',
  }
  return map[status || ''] || 'info'
}

function machineStatusText(status?: string) {
  const normalized = String(status || '').toUpperCase()
  const map: Record<string, string> = {
    RUNNING: '运行',
    IDLE: '空闲',
    MAINTENANCE: '保养',
    REPAIR: '维修',
    OFFLINE: '离线',
  }
  return map[normalized] || status || '-'
}

function machineStatusType(status?: string) {
  const normalized = String(status || '').toUpperCase()
  const map: Record<string, string> = {
    RUNNING: 'success',
    IDLE: 'info',
    MAINTENANCE: 'warning',
    REPAIR: 'danger',
    OFFLINE: 'info',
  }
  return map[normalized] || 'info'
}

function progressColor(status?: string) {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'RUNNING') return '#67c23a'
  if (normalized === 'PAUSED') return '#f56c6c'
  if (normalized === 'FINISHED') return '#409eff'
  return '#e6a23c'
}

function goTo(path: string) {
  router.push(path)
}

function buildCharts() {
  const productionTrend = homeData.value.productionTrend || []
  productionChart?.setOption(
    {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 36, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category',
        data: productionTrend.map((item) => item.date || '-'),
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: '#cfd6df' } },
      },
      yAxis: {
        type: 'value',
        name: '件',
        splitLine: { lineStyle: { color: '#eef1f4' } },
      },
      series: [
        {
          name: '产量',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          data: productionTrend.map((item) => item.qty || 0),
          lineStyle: { width: 3, color: '#409eff' },
          itemStyle: { color: '#409eff' },
          areaStyle: { color: 'rgba(64, 158, 255, 0.12)' },
        },
      ],
    },
    true
  )

  const orderStatusDistribution = (homeData.value.orderStatusDistribution || []).filter((item) => (item.count || 0) > 0)
  orderChart?.setOption(
    {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle' },
      series: [
        {
          name: '订单状态',
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}\n{d}%' },
          data: orderStatusDistribution.map((item, index) => ({
            name: item.label || item.status || '-',
            value: item.count || 0,
            itemStyle: { color: orderColors[index % orderColors.length] },
          })),
        },
      ],
    },
    true
  )
}

function initCharts() {
  if (productionChartRef.value && !productionChart) {
    productionChart = echarts.init(productionChartRef.value)
  }
  if (orderChartRef.value && !orderChart) {
    orderChart = echarts.init(orderChartRef.value)
  }
}

function handleResize() {
  productionChart?.resize()
  orderChart?.resize()
}

async function fetchData() {
  loading.value = true
  try {
    if (!isSupabaseConfigured) {
      homeData.value = {}
      productionData.value = {}
      warningList.value = []
      warningSummary.value = {}
      oeeData.value = {}
      downtimeMinutes.value = 0
      lastUpdated.value = formatDateTime(new Date())
      buildCharts()
      return
    }

    const today = formatDate(new Date())
    const results = await Promise.allSettled([
      getDashboardData(),
      getProductionBoard(),
      getWarningList(),
      getWarningSummary(),
      getOeeStats({ date: today }),
      getDowntimeRecordList({ page: 1, pageSize: 200, startDate: today, endDate: today }),
    ])

    const failed: string[] = []

    if (results[0].status === 'fulfilled') {
      homeData.value = results[0].value.data || {}
    } else {
      failed.push('工作台概览')
    }

    if (results[1].status === 'fulfilled') {
      productionData.value = results[1].value.data || {}
    } else {
      failed.push('生产看板')
    }

    if (results[2].status === 'fulfilled') {
      warningList.value = results[2].value.data || []
    } else {
      failed.push('预警列表')
    }

    if (results[3].status === 'fulfilled') {
      warningSummary.value = results[3].value.data || {}
    } else {
      failed.push('预警统计')
    }

    if (results[4].status === 'fulfilled') {
      oeeData.value = results[4].value.data || {}
    } else {
      failed.push('OEE')
    }

    if (results[5].status === 'fulfilled') {
      const records = results[5].value.data?.list || results[5].value.data?.records || []
      downtimeMinutes.value = calcDowntimeMinutes(records)
    } else {
      failed.push('停机记录')
    }

    buildCharts()
    lastUpdated.value = formatDateTime(new Date())

    if (failed.length) {
      ElMessage.warning(`部分工作台数据加载失败：${failed.join('、')}`)
    }
  } catch {
    ElMessage.error('工作台数据加载失败')
  } finally {
    loading.value = false
  }
}

const totalShiftBadQty = computed(() => {
  return (productionData.value.shiftOutputs || []).reduce((sum, item) => sum + Number(item.badQty || 0), 0)
})

const kpiCards = computed(() => {
  const completionRate = calcCompletionRate()
  const oeeValue = Number(oeeData.value.oee || 0)
  return [
    {
      label: '今日产出',
      value: numberText(homeData.value.todayProductionQty),
      meta: '当日报工累计',
      icon: TrendCharts,
      tone: 'primary' as const,
    },
    {
      label: '工单完成率',
      value: completionRate,
      valueType: 'percent' as const,
      precision: 1,
      meta: `${productionData.value.orderProgresses?.length || 0} 条在制工单`,
      icon: Odometer,
      tone: 'success' as const,
    },
    {
      label: 'OEE',
      value: oeeValue,
      valueType: 'percent' as const,
      precision: 1,
      meta: '设备综合效率',
      icon: DataLine,
      tone: 'warning' as const,
    },
    {
      label: '停机分钟',
      value: downtimeMinutes.value,
      unit: ' 分钟',
      meta: '今日停机累计',
      icon: WarningFilled,
      tone: 'warning' as const,
    },
    {
      label: '预警数',
      value: numberText(warningSummary.value.total),
      meta: `严重 ${warningSummary.value.error || 0} / 预警 ${warningSummary.value.warning || 0}`,
      icon: Bell,
      tone: 'danger' as const,
    },
    {
      label: '待处理工单',
      value: numberText(homeData.value.pendingOrderQty),
      meta: '计划、生产、暂停中的工单',
      icon: List,
      tone: 'primary' as const,
    },
    {
      label: '未读消息',
      value: numberText(homeData.value.unreadNotificationQty),
      meta: '通知中心未读项',
      icon: CircleCheck,
      tone: 'success' as const,
    },
  ]
})

const detailRows = computed(() => {
  return [
    { label: '运行设备', value: numberText(homeData.value.runningMachineQty), note: '当前在线设备数量' },
    { label: '班次产量', value: numberText((productionData.value.shiftOutputs || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)), note: '今日班次良品总数' },
    { label: '不良品', value: numberText(totalShiftBadQty.value), note: '今日班次不良总数' },
    { label: '库存预警', value: numberText(warningSummary.value.stock), note: '库存类预警数量' },
    { label: '模具预警', value: numberText(warningSummary.value.mold), note: '模具类预警数量' },
    { label: '未读通知', value: numberText(homeData.value.unreadNotificationQty), note: '系统消息未读数量' },
  ]
})

const warningSummaryTagType = computed(() => {
  if ((warningSummary.value.error || 0) > 0) return 'danger'
  if ((warningSummary.value.warning || 0) > 0) return 'warning'
  return 'success'
})

onMounted(async () => {
  await nextTick()
  initCharts()
  window.addEventListener('resize', handleResize)
  await fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  productionChart?.dispose()
  orderChart?.dispose()
})
</script>

<style scoped lang="scss">
.workbench-page {
  gap: 16px;
}

.action-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid #dfe5ec;
  border-radius: 10px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.03);
}

.action-btn:hover {
  border-color: #cbd5e1;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.action-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.action-text {
  font-size: 14px;
  font-weight: 600;
}

.action-primary .action-icon {
  color: #409eff;
}

.action-success .action-icon {
  color: #67c23a;
}

.action-warning .action-icon {
  color: #e6a23c;
}

.action-info .action-icon {
  color: #909399;
}

.action-danger .action-icon {
  color: #f56c6c;
}

.band-row {
  margin-bottom: 0;
}

.setup-state {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 0 4px;
}

.setup-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
  border: 1px solid #f3e2bf;
  border-radius: 8px;
  background: linear-gradient(180deg, #fff8eb 0%, #fffdf8 100%);
}

.setup-copy {
  min-width: 0;
  flex: 1;
}

.setup-eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #b7791f;
}

.setup-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  color: #1f2937;
}

.setup-description {
  margin: 12px 0 0;
  max-width: 720px;
  font-size: 14px;
  line-height: 1.7;
  color: #6b7280;
}

.setup-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.config-dialog-alert {
  margin-bottom: 18px;
}

.config-form :deep(.el-form-item__label) {
  padding-bottom: 5px;
  color: #475569;
  font-weight: 600;
}

.config-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

:global(.supabase-config-dialog.el-dialog) {
  max-height: 92vh;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:global(.supabase-config-dialog .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}

.setup-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.setup-card {
  padding: 18px 18px 16px;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
}

.setup-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.setup-card-head h4 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.setup-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #eef4ff;
  color: #3159b7;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.setup-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.setup-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.setup-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  font-size: 12px;
  color: #8b95a1;
}

.panel-card {
  min-height: 100%;
}

.panel-card-tall {
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 22px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.chart-panel {
  min-width: 0;
}

.chart-title {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.chart-container {
  height: 320px;
}

.compact-table {
  width: 100%;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-cell :deep(.el-progress) {
  flex: 1;
  min-width: 0;
}

.progress-text {
  flex-shrink: 0;
  width: 58px;
  text-align: right;
  font-size: 12px;
  color: #4b5563;
}

.warning-table :deep(.el-table__row) {
  cursor: default;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid #edf0f3;
  border-radius: 8px;
  background: #fafbfc;
}

.todo-item--clickable {
  cursor: pointer;
}

.todo-item--clickable:hover {
  border-color: #c7d2fe;
  background: #f8fbff;
}

.todo-main {
  min-width: 0;
  flex: 1;
}

.todo-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.todo-type {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.todo-content {
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}

.todo-description {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #8b95a1;
}

.todo-time {
  flex-shrink: 0;
  font-size: 12px;
  color: #8b95a1;
  white-space: nowrap;
}

@media (max-width: 1400px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1200px) {
  .action-strip {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .setup-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 992px) {
  .band-row :deep(.el-col) {
    margin-bottom: 16px;
  }

  .setup-hero {
    flex-direction: column;
  }

  .setup-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .setup-hero {
    padding: 18px;
  }

  .setup-title {
    font-size: 20px;
  }
}
</style>
