<template>
  <div class="page-container">
    <PageHeader title="操作日志">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" plain :disabled="!tableData.length" @click="handleExport">
        <el-icon><Download /></el-icon>
        导出当前页
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期">
        <el-date-picker
          v-model="searchDate"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
      </el-form-item>
      <el-form-item label="动作">
        <el-select v-model="searchAction" placeholder="全部" clearable style="width: 120px">
          <el-option v-for="item in SYSTEM_LOG_ACTION_FILTER_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="目标">
        <el-input v-model="searchTargetType" clearable placeholder="如 product" style="width: 150px" />
      </el-form-item>
    </SearchBar>

    <div class="summary-grid">
      <div v-for="item in summaryItems" :key="item.label" class="summary-item" :class="{ danger: item.danger, warning: item.warning }">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.tip }}</small>
      </div>
    </div>

    <el-card shadow="hover">
      <el-table :data="tableData" row-key="id" stripe v-loading="loading" empty-text="暂无操作日志">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="username" label="操作人" width="120" />
        <el-table-column prop="module" label="模块" min-width="130" show-overflow-tooltip />
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-tag :type="row.actionTag" effect="plain">{{ row.actionText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="风险" width="90">
          <template #default="{ row }">
            <el-tag :type="riskTag(row.actionRisk)" effect="plain">{{ riskText(row.actionRisk) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目标" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.targetType }}#{{ row.targetId }}
          </template>
        </el-table-column>
        <el-table-column prop="changeSummary" label="变更摘要" min-width="180" show-overflow-tooltip />
        <el-table-column prop="oldValueText" label="变更前" min-width="220" show-overflow-tooltip />
        <el-table-column prop="newValueText" label="变更后" min-width="220" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP地址" width="140" />
        <el-table-column prop="createdAt" label="操作时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[20, 50, 100, 200]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="handlePageSizeChange"
        @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getLogList } from '@/api/system'
import { formatDateTime } from '@/utils'
import {
  SYSTEM_LOG_ACTION_FILTER_OPTIONS,
  buildSystemLogExportPackage,
  buildSystemLogQuery,
  buildSystemLogSummary,
  normalizeSystemLogKeyword,
  normalizeSystemLogList,
  type SystemLogRecord,
  type SystemLogRisk,
} from '@/utils/system-logs'

const route = useRoute()
const loading = ref(false)
const tableData = ref<SystemLogRecord[]>([])
const searchKeyword = ref('')
const searchDate = ref<string[]>([])
const searchAction = ref('')
const searchTargetType = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
let fetchSeq = 0

const pageSummary = computed(() => buildSystemLogSummary(tableData.value))
const summaryItems = computed(() => [
  { label: '当前页日志', value: `${pageSummary.value.total} 条`, tip: `共 ${pagination.total} 条匹配记录` },
  { label: '高风险', value: `${pageSummary.value.danger} 条`, tip: '删除/驳回等敏感动作', danger: pageSummary.value.danger > 0 },
  { label: '需复核', value: `${pageSummary.value.warning} 条`, tip: '修改/导入/导出/审批', warning: pageSummary.value.warning > 0 },
  { label: '变更记录', value: `${pageSummary.value.changed} 条`, tip: `${pageSummary.value.actorCount} 个操作人 / ${pageSummary.value.moduleCount} 个模块` },
])

async function fetchData() {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const query = buildSystemLogQuery({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value,
      action: searchAction.value,
      targetType: searchTargetType.value,
    })
    if (searchDate.value.length === 2) {
      query.startDate = searchDate.value[0]
      query.endDate = searchDate.value[1]
    }
    const res: any = await getLogList(query)
    if (seq !== fetchSeq) return
    const rows = res.data?.records || res.data?.list || []
    tableData.value = normalizeSystemLogList(rows)
    pagination.total = Number(res.data?.total || tableData.value.length)
  } catch (error: any) {
    if (seq !== fetchSeq) return
    tableData.value = []
    pagination.total = 0
    ElMessage.error(error?.message || '操作日志加载失败')
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = normalizeSystemLogKeyword(formData.keyword)
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchDate.value = []
  searchAction.value = ''
  searchTargetType.value = ''
  pagination.page = 1
  fetchData()
}

function handlePageSizeChange() {
  pagination.page = 1
  fetchData()
}

function riskTag(value: SystemLogRisk) {
  if (value === 'danger') return 'danger'
  if (value === 'warning') return 'warning'
  return 'info'
}

function riskText(value: SystemLogRisk) {
  if (value === 'danger') return '高'
  if (value === 'warning') return '中'
  return '低'
}

function handleExport() {
  if (!tableData.value.length) {
    ElMessage.warning('暂无可导出的操作日志')
    return
  }
  const payload = buildSystemLogExportPackage(tableData.value)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  link.href = url
  link.download = `操作日志_${timestamp}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

watch(
  () => route.query.keyword,
  (value) => {
    const keyword = Array.isArray(value) ? value[0] : value
    searchKeyword.value = normalizeSystemLogKeyword(keyword)
    pagination.page = 1
    fetchData()
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin: 12px 0;
}

.summary-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid #e8ebf0;
  border-radius: 8px;
  background: #fff;
  display: grid;
  gap: 5px;

  span,
  small {
    color: #606266;
    line-height: 1.3;
  }

  strong {
    font-size: 20px;
    color: #303133;
    line-height: 1.2;
  }

  &.danger {
    border-color: #f3d1d1;
    background: #fff8f8;

    strong {
      color: #c45656;
    }
  }

  &.warning {
    border-color: #f3d9a7;
    background: #fffaf0;

    strong {
      color: #b88230;
    }
  }
}
</style>
