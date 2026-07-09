<template>
  <div class="page-container defect-disposal-page" v-loading="loading">
    <PageHeader title="不良品处置">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" plain @click="goTo('/qc/records')">
        <el-icon><DocumentChecked /></el-icon>
        质检记录
      </el-button>
    </PageHeader>

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <MetricStrip class="metric-section" :items="metricCards" testid="defect-disposal-metrics" />

    <el-card shadow="hover">
      <el-table :data="rows" stripe empty-text="暂无不良品处置记录">
        <el-table-column prop="orderNo" label="工单" min-width="130" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品" min-width="130" show-overflow-tooltip />
        <el-table-column prop="defectType" label="不良类型" min-width="130" show-overflow-tooltip />
        <el-table-column prop="defectQty" label="不良数量" width="100" />
        <el-table-column prop="defectDesc" label="问题描述" min-width="190" show-overflow-tooltip />
        <el-table-column label="处置状态" width="120">
          <template #default="{ row }">
            <el-tag :type="workflowTag(row.workflowStatus)" effect="plain">{{ workflowText(row.workflowStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assignee" label="责任人" width="120">
          <template #default="{ row }">{{ row.assignee || '-' }}</template>
        </el-table-column>
        <el-table-column prop="closeReason" label="关闭说明" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.workflowStatus === 'OPEN'"
              type="primary"
              link
              :loading="isActionLoading(row, 'assign')"
              @click="assign(row)"
            >分派</el-button>
            <el-button
              v-if="row.workflowStatus === 'ASSIGNED'"
              type="warning"
              link
              :loading="isActionLoading(row, 'start')"
              @click="start(row)"
            >处理</el-button>
            <el-button
              v-if="row.workflowStatus !== 'CLOSED'"
              type="success"
              link
              :loading="isActionLoading(row, 'close')"
              @click="close(row)"
            >关闭</el-button>
            <el-button type="primary" link @click="goTo('/qc/records')">记录</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DocumentChecked, Refresh } from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import { getQcRecordList, updateQcRecord } from '@/api/qcRecord'

type WorkflowStatus = 'OPEN' | 'ASSIGNED' | 'PROCESSING' | 'CLOSED'
type WorkflowAction = 'assign' | 'start' | 'close'

const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const actionRowId = ref<number | null>(null)
const actionName = ref<WorkflowAction | ''>('')
const defects = ref<any[]>([])

const rows = computed(() =>
  defects.value.map((row) => {
    return {
      ...row,
      workflowStatus: normalizeWorkflowStatus(row.disposalStatus),
      assignee: row.disposalAssignee || '',
      closeReason: row.disposalCloseReason || '',
    }
  })
)

const summary = computed(() => ({
  total: rows.value.length,
  open: rows.value.filter((item) => item.workflowStatus === 'OPEN').length,
  processing: rows.value.filter((item) => item.workflowStatus === 'ASSIGNED' || item.workflowStatus === 'PROCESSING').length,
  closed: rows.value.filter((item) => item.workflowStatus === 'CLOSED').length,
}))

const metricCards = computed(() => [
  { label: '不良记录', value: summary.value.total, meta: '来自不合格质检记录', tone: 'primary' as const },
  { label: '待处理', value: summary.value.open, meta: '尚未分派或确认处置', tone: 'danger' as const },
  { label: '处理中', value: summary.value.processing, meta: '已分派或处理中', tone: 'warning' as const },
  { label: '已关闭', value: summary.value.closed, meta: '已完成处置闭环', tone: 'success' as const },
])

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

function normalizeWorkflowStatus(value?: string): WorkflowStatus {
  const status = String(value || '').toUpperCase()
  if (['OPEN', 'ASSIGNED', 'PROCESSING', 'CLOSED'].includes(status)) return status as WorkflowStatus
  return 'OPEN'
}

function isActionLoading(row: any, action: WorkflowAction) {
  return Number(row.id) === actionRowId.value && actionName.value === action
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getQcRecordList({ page: 1, pageSize: 100, checkResult: 'FAIL' })
    defects.value = res.data?.records || res.data || []
  } catch (error: any) {
    defects.value = []
    errorMessage.value = failureText(error, '不良品处置加载失败，请检查 Supabase 连接、qc_record 表和不合格质检记录。')
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

async function updateWorkflow(row: any, action: WorkflowAction, payload: Record<string, any>, successText: string) {
  actionRowId.value = Number(row.id)
  actionName.value = action
  try {
    await updateQcRecord(Number(row.id), {
      ...payload,
      disposalUpdatedAt: new Date().toISOString(),
    })
    ElMessage.success(successText)
    await fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, '不良品处置状态保存失败，请检查 Supabase 写入权限和处置字段。'))
  } finally {
    actionRowId.value = null
    actionName.value = ''
  }
}

async function assign(row: any) {
  try {
    const result = await ElMessageBox.prompt('请输入责任人或责任部门', '分派不良品处置', {
      confirmButtonText: '分派',
      cancelButtonText: '取消',
      inputValue: row.assignee || '',
    })
    await updateWorkflow(row, 'assign', {
      disposalStatus: 'ASSIGNED',
      disposalAssignee: result.value || '质量部',
      disposalCloseReason: '',
    }, '已分派')
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(failureText(error, '不良品处置分派失败。'))
  }
}

function start(row: any) {
  updateWorkflow(row, 'start', {
    disposalStatus: 'PROCESSING',
    disposalAssignee: row.assignee || '质量部',
  }, '已进入处理')
}

async function close(row: any) {
  try {
    const result = await ElMessageBox.prompt('请输入处置结果和关闭说明', '关闭不良品处置', {
      confirmButtonText: '关闭',
      cancelButtonText: '取消',
      inputType: 'textarea',
    })
    const closeReason = String(result.value || '').trim()
    if (!closeReason) {
      ElMessage.warning('关闭不良品处置必须填写处置结果')
      return
    }
    await updateWorkflow(row, 'close', {
      disposalStatus: 'CLOSED',
      disposalAssignee: row.assignee || '质量部',
      disposalCloseReason: closeReason,
    }, '已关闭')
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(failureText(error, '不良品处置关闭失败。'))
  }
}

function workflowText(status: WorkflowStatus) {
  const map: Record<WorkflowStatus, string> = {
    OPEN: '待处理',
    ASSIGNED: '已分派',
    PROCESSING: '处理中',
    CLOSED: '已关闭',
  }
  return map[status]
}

function workflowTag(status: WorkflowStatus) {
  if (status === 'CLOSED') return 'success'
  if (status === 'PROCESSING' || status === 'ASSIGNED') return 'warning'
  return 'danger'
}

function goTo(path: string) {
  router.push(path)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.page-alert {
  margin-bottom: 12px;
}
</style>
