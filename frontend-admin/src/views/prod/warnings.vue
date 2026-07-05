<template>
  <div class="page-container">
    <PageHeader title="预警中心">
      <el-button type="primary" plain @click="goNotifications">
        <el-icon><Bell /></el-icon>消息中心
      </el-button>
      <el-button type="success" plain @click="fetchData">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </PageHeader>

    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="item in statCards" :key="item.title">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-card-content">
            <div>
              <div class="stat-title">{{ item.title }}</div>
              <div class="stat-value">{{ item.value }}</div>
            </div>
            <el-icon :size="34" :style="{ color: item.color }">
              <component :is="item.icon" />
            </el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="分类">
        <el-select v-model="searchCategory" placeholder="全部" clearable style="width: 140px">
          <el-option label="库存" value="库存" />
          <el-option label="模具" value="模具" />
        </el-select>
      </el-form-item>
      <el-form-item label="等级">
        <el-select v-model="searchLevel" placeholder="全部" clearable style="width: 140px">
          <el-option label="警告" value="WARNING" />
          <el-option label="严重" value="ERROR" />
        </el-select>
      </el-form-item>
      <el-form-item label="闭环">
        <el-select v-model="searchWorkflowStatus" placeholder="全部" clearable style="width: 140px">
          <el-option label="待分派" value="open" />
          <el-option label="已分派" value="assigned" />
          <el-option label="处理中" value="processing" />
          <el-option label="已关闭" value="closed" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="filteredWarnings" stripe v-loading="loading" @row-click="handleRowClick">
        <el-table-column prop="category" label="分类" width="100">
          <template #default="{ row }">
            <el-tag :type="row.category === '模具' ? 'warning' : 'success'">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="row.level === 'ERROR' ? 'danger' : 'warning'">
              {{ row.level === 'ERROR' ? '严重' : '警告' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="140" />
        <el-table-column prop="title" label="对象" width="150" />
        <el-table-column prop="targetName" label="名称" width="160" />
        <el-table-column prop="value" label="当前值" width="100" />
        <el-table-column prop="threshold" label="阈值" width="100" />
        <el-table-column prop="message" label="预警内容" min-width="320" show-overflow-tooltip />
        <el-table-column label="闭环状态" width="110">
          <template #default="{ row }">
            <el-tag :type="workflowTagType(row.workflowStatus)" effect="plain">
              {{ workflowStatusText(row.workflowStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assignee" label="负责人" width="110" show-overflow-tooltip />
        <el-table-column label="闭环动作" width="105" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="handleWorkflowAction(row)">
              {{ row.nextAction }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getWarningList, getWarningSummary } from '@/api/warning'
import {
  buildWarningWorkflowItems,
  createWarningWorkflowState,
  getWarningWorkflowStatusText,
  summarizeWarningWorkflow,
  type WarningWorkflowItem,
  type WarningWorkflowState,
  type WarningWorkflowStatus,
} from '@/utils/warning-workflow'

const router = useRouter()
const loading = ref(false)
const warnings = ref<any[]>([])
const summary = ref<any>({})
const workflowStates = ref<WarningWorkflowState[]>([])
const searchKeyword = ref('')
const searchCategory = ref('')
const searchLevel = ref('')
const searchWorkflowStatus = ref('')
const WORKFLOW_STORAGE_KEY = 'inject_erp_warning_workflow_states'

const statCards = computed(() => [
  { title: '预警总数', value: summary.value.total ?? 0, icon: 'Bell', color: '#e6a23c' },
  { title: '库存预警', value: summary.value.stock ?? 0, icon: 'Coin', color: '#67c23a' },
  { title: '严重预警', value: summary.value.error ?? 0, icon: 'WarningFilled', color: '#d9534f' },
  { title: '待闭环严重', value: workflowSummary.value.unclosedError, icon: 'Checked', color: '#c45656' },
])

const workflowWarnings = computed(() => buildWarningWorkflowItems(warnings.value, workflowStates.value))
const workflowSummary = computed(() => summarizeWarningWorkflow(workflowWarnings.value))

const filteredWarnings = computed(() => {
  return workflowWarnings.value.filter((item) => {
    const keywordHit = !searchKeyword.value
      || String(item.type || '').includes(searchKeyword.value)
      || String(item.title || '').includes(searchKeyword.value)
      || String(item.targetName || '').includes(searchKeyword.value)
      || String(item.message || '').includes(searchKeyword.value)
    const categoryHit = !searchCategory.value || item.category === searchCategory.value
    const levelHit = !searchLevel.value || item.level === searchLevel.value
    const workflowHit = !searchWorkflowStatus.value || item.workflowStatus === searchWorkflowStatus.value
    return keywordHit && categoryHit && levelHit && workflowHit
  })
})

function handleRowClick() {
  router.push('/system/notifications')
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
}

function handleReset() {
  searchKeyword.value = ''
  searchCategory.value = ''
  searchLevel.value = ''
  searchWorkflowStatus.value = ''
}

function goNotifications() {
  router.push('/system/notifications')
}

function loadWorkflowStates() {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY)
    const rows = raw ? JSON.parse(raw) : []
    workflowStates.value = Array.isArray(rows) ? rows : []
  } catch {
    workflowStates.value = []
  }
}

function saveWorkflowStates() {
  window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflowStates.value))
}

function upsertWorkflowState(state: WarningWorkflowState) {
  const index = workflowStates.value.findIndex((item) => item.warningId === state.warningId)
  if (index >= 0) {
    workflowStates.value.splice(index, 1, state)
  } else {
    workflowStates.value.push(state)
  }
  saveWorkflowStates()
}

function workflowStatusText(value: WarningWorkflowStatus) {
  return getWarningWorkflowStatusText(value)
}

function workflowTagType(value: WarningWorkflowStatus) {
  if (value === 'closed') return 'success'
  if (value === 'processing') return 'warning'
  if (value === 'assigned') return 'primary'
  return 'info'
}

function handleWorkflowAction(row: WarningWorkflowItem) {
  const assignee = row.assignee === '未分派' ? '当班班长' : row.assignee
  if (row.workflowStatus === 'open') {
    upsertWorkflowState(createWarningWorkflowState(row.id, 'assigned', assignee))
    ElMessage.success('预警已分派')
    return
  }
  if (row.workflowStatus === 'assigned') {
    upsertWorkflowState(createWarningWorkflowState(row.id, 'processing', assignee))
    ElMessage.success('预警已进入处理')
    return
  }
  if (row.workflowStatus === 'processing') {
    upsertWorkflowState(createWarningWorkflowState(row.id, 'closed', assignee, '现场处理完成'))
    ElMessage.success('预警已关闭')
    return
  }
  router.push({ path: '/system/notifications', query: { keyword: row.title } })
}

async function fetchData() {
  loading.value = true
  try {
    const [listRes, summaryRes]: any = await Promise.all([getWarningList(), getWarningSummary()])
    warnings.value = listRes.data || []
    summary.value = summaryRes.data || {}
  } catch {
    warnings.value = []
    summary.value = {}
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadWorkflowStates()
  fetchData()
})
</script>

<style scoped lang="scss">
.stat-row {
  margin-bottom: 16px;
}

.stat-card {
  .stat-card-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-title {
    font-size: 14px;
    color: #909399;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 26px;
    font-weight: 700;
    color: #303133;
  }
}
</style>
