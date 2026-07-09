<template>
  <div class="page-container">
    <PageHeader title="消息中心">
      <el-button type="primary" plain @click="fetchData">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchReadState" placeholder="全部" clearable style="width: 140px" @change="handleReadStateChange">
          <el-option label="未读" value="0" />
          <el-option label="已读" value="1" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <MetricStrip :items="summaryCards" testid="notification-center-metrics" />

    <el-card shadow="hover">
      <el-table :data="tableData" row-key="id" stripe v-loading="loading" empty-text="暂无消息">
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="content" label="内容" min-width="320" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="notificationTypeTag(row.type)">{{ notificationTypeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isRead" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isRead ? 'info' : 'danger'">{{ row.isRead ? '已读' : '未读' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button v-if="!row.isRead" type="primary" link @click="markRead(row)">标记已读</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-button :loading="markingAll" @click="markAllVisibleRead" :disabled="!unreadItems.length">当前页全部设为已读</el-button>
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handlePageSizeChange"
          @current-change="fetchData"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import MetricStrip, { type MetricStripItem } from '@/components/MetricStrip.vue'
import { formatDateTime } from '@/utils'
import { getNotificationList, markNotificationRead } from '@/api/notification'
import {
  buildBatchReadSummary,
  buildNotificationQuery,
  buildNotificationSummary,
  collectUnreadNotificationIds,
  normalizeNotificationList,
  normalizeNotificationReadState,
  notificationTypeTag,
  notificationTypeText,
  type NotificationReadState,
  type NotificationRecord,
} from '@/utils/notification-center'

const loading = ref(false)
const markingAll = ref(false)
const tableData = ref<NotificationRecord[]>([])
const searchKeyword = ref('')
const searchReadState = ref<NotificationReadState>('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const pageSummary = computed(() => buildNotificationSummary(tableData.value))
const unreadItems = computed(() => tableData.value.filter((item) => !item.isRead))
const summaryCards = computed<MetricStripItem[]>(() => [
  { label: '当前页消息', value: pageSummary.value.total, meta: `共 ${pagination.total} 条匹配记录`, tone: 'neutral' },
  { label: '未读', value: pageSummary.value.unread, meta: '需要处理或确认', tone: pageSummary.value.unread ? 'danger' : 'success' },
  { label: '严重', value: pageSummary.value.error, meta: '异常/阻断类消息', tone: pageSummary.value.error ? 'danger' : 'neutral' },
  { label: '警告', value: pageSummary.value.warning, meta: '预警和待复核事项', tone: pageSummary.value.warning ? 'warning' : 'neutral' },
])

async function fetchData() {
  loading.value = true
  try {
    const query = buildNotificationQuery({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      readState: searchReadState.value,
    })
    const res: any = await getNotificationList(query)
    const rows = res.data?.records || res.data?.list || []
    tableData.value = normalizeNotificationList(rows)
    pagination.total = Number(res.data?.total || tableData.value.length)
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    ElMessage.error(error?.message || '消息加载失败')
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReadStateChange(value: string) {
  searchReadState.value = normalizeNotificationReadState(value)
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchReadState.value = ''
  pagination.page = 1
  fetchData()
}

function handlePageSizeChange() {
  pagination.page = 1
  fetchData()
}

function notifyReadChanged() {
  window.dispatchEvent(new Event('notification-updated'))
}

async function markRead(row: NotificationRecord) {
  if (!row.id || row.isRead) return
  try {
    await markNotificationRead(row.id)
    ElMessage.success('已标记已读')
    notifyReadChanged()
    await fetchData()
  } catch (error: any) {
    ElMessage.error(error?.message || '标记已读失败')
  }
}

async function markAllVisibleRead() {
  const unreadIds = collectUnreadNotificationIds(unreadItems.value)
  if (!unreadIds.length) {
    ElMessage.info('当前页没有未读消息')
    return
  }
  markingAll.value = true
  const results = await Promise.allSettled(unreadIds.map((id) => markNotificationRead(id)))
  const success = results.filter((item) => item.status === 'fulfilled').length
  const summary = buildBatchReadSummary(unreadIds.length, success)
  if (summary.state === 'success') ElMessage.success(summary.message)
  else if (summary.state === 'warning') ElMessage.warning(summary.message)
  else if (summary.state === 'error') ElMessage.error(summary.message)
  else ElMessage.info(summary.message)
  if (success > 0) {
    notifyReadChanged()
  }
  try {
    await fetchData()
  } finally {
    markingAll.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.page-container {
  .el-card {
    margin-top: 16px;
  }
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
}

@media (max-width: 640px) {
  .table-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
