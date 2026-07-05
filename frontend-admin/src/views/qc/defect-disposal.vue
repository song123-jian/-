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

    <section class="kpi-grid">
      <article class="kpi-card">
        <span>不良记录</span>
        <strong>{{ summary.total }}</strong>
        <small>来自不合格质检记录</small>
      </article>
      <article class="kpi-card kpi-card--danger">
        <span>待处理</span>
        <strong>{{ summary.open }}</strong>
        <small>尚未分派或确认处置</small>
      </article>
      <article class="kpi-card kpi-card--warning">
        <span>处理中</span>
        <strong>{{ summary.processing }}</strong>
        <small>已分派或处理中</small>
      </article>
      <article class="kpi-card kpi-card--success">
        <span>已关闭</span>
        <strong>{{ summary.closed }}</strong>
        <small>已完成处置闭环</small>
      </article>
    </section>

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
            <el-button v-if="row.workflowStatus === 'open'" type="primary" link @click="assign(row)">分派</el-button>
            <el-button v-if="row.workflowStatus === 'assigned'" type="warning" link @click="start(row)">处理</el-button>
            <el-button v-if="row.workflowStatus !== 'closed'" type="success" link @click="close(row)">关闭</el-button>
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
import PageHeader from '@/components/PageHeader.vue'
import { getQcRecordList } from '@/api/qcRecord'

type WorkflowStatus = 'open' | 'assigned' | 'processing' | 'closed'
type WorkflowState = {
  status: WorkflowStatus
  assignee?: string
  closeReason?: string
  updatedAt?: string
}

const STORAGE_KEY = 'inject_erp_defect_disposal_workflow'
const router = useRouter()
const loading = ref(false)
const defects = ref<any[]>([])
const states = ref<Record<string, WorkflowState>>({})

const rows = computed(() =>
  defects.value.map((row) => {
    const state = states.value[String(row.id)] || { status: 'open' as WorkflowStatus }
    return {
      ...row,
      workflowStatus: state.status,
      assignee: state.assignee || '',
      closeReason: state.closeReason || '',
    }
  })
)

const summary = computed(() => ({
  total: rows.value.length,
  open: rows.value.filter((item) => item.workflowStatus === 'open').length,
  processing: rows.value.filter((item) => item.workflowStatus === 'assigned' || item.workflowStatus === 'processing').length,
  closed: rows.value.filter((item) => item.workflowStatus === 'closed').length,
}))

function loadStates() {
  try {
    states.value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    states.value = {}
  }
}

function saveState(id: number | string, state: WorkflowState) {
  states.value[String(id)] = { ...state, updatedAt: new Date().toISOString() }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states.value))
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getQcRecordList({ page: 1, pageSize: 100, checkResult: 'FAIL' })
    defects.value = res.data?.records || res.data || []
  } finally {
    loading.value = false
  }
}

async function assign(row: any) {
  const result = await ElMessageBox.prompt('请输入责任人或责任部门', '分派不良品处置', {
    confirmButtonText: '分派',
    cancelButtonText: '取消',
    inputValue: row.assignee || '',
  })
  saveState(row.id, { status: 'assigned', assignee: result.value || '质量部' })
  ElMessage.success('已分派')
}

function start(row: any) {
  saveState(row.id, { status: 'processing', assignee: row.assignee || '质量部' })
  ElMessage.success('已进入处理')
}

async function close(row: any) {
  const result = await ElMessageBox.prompt('请输入处置结果和关闭说明', '关闭不良品处置', {
    confirmButtonText: '关闭',
    cancelButtonText: '取消',
    inputType: 'textarea',
  })
  saveState(row.id, {
    status: 'closed',
    assignee: row.assignee || '质量部',
    closeReason: result.value || '已完成处置',
  })
  ElMessage.success('已关闭')
}

function workflowText(status: WorkflowStatus) {
  const map: Record<WorkflowStatus, string> = {
    open: '待处理',
    assigned: '已分派',
    processing: '处理中',
    closed: '已关闭',
  }
  return map[status]
}

function workflowTag(status: WorkflowStatus) {
  if (status === 'closed') return 'success'
  if (status === 'processing' || status === 'assigned') return 'warning'
  return 'danger'
}

function goTo(path: string) {
  router.push(path)
}

onMounted(() => {
  loadStates()
  fetchData()
})
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
}
</style>
