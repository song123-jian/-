<template>
  <div class="page-container">
    <PageHeader title="消息中心">
      <el-button type="primary" plain @click="fetchData">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchReadState" placeholder="全部" clearable style="width: 140px">
          <el-option label="未读" value="0" />
          <el-option label="已读" value="1" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="filteredData" stripe v-loading="loading">
        <el-table-column prop="title" label="标题" width="160" />
        <el-table-column prop="content" label="内容" min-width="320" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="tagType(row.type)">{{ typeText(row.type) }}</el-tag>
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
      <div class="footer-actions">
        <el-button @click="markAllVisibleRead" :disabled="!unreadItems.length">全部设为已读</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getNotificationList, markNotificationRead } from '@/api/notification'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchReadState = ref('')

const filteredData = computed(() => {
  return tableData.value.filter((item) => {
    const keywordHit = !searchKeyword.value
      || String(item.title || '').includes(searchKeyword.value)
      || String(item.content || '').includes(searchKeyword.value)
    const stateHit = !searchReadState.value
      || (searchReadState.value === '1' ? item.isRead : !item.isRead)
    return keywordHit && stateHit
  })
})

function typeText(value?: string) {
  const map: Record<string, string> = {
    WARNING: '警告',
    INFO: '消息',
    ERROR: '严重',
  }
  return map[value || ''] || value || '-'
}

function tagType(value?: string) {
  if (value === 'ERROR') return 'danger'
  if (value === 'WARNING') return 'warning'
  return 'info'
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getNotificationList({
      page: 1,
      pageSize: 200,
      keyword: searchKeyword.value || undefined,
      isRead: searchReadState.value !== '' ? Number(searchReadState.value) : undefined,
    })
    tableData.value = res.data?.records || res.data?.list || []
  } catch {
    tableData.value = []
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchReadState.value = ''
  fetchData()
}

async function markRead(row: any) {
  await markNotificationRead(row.id)
  ElMessage.success('已标记已读')
  window.dispatchEvent(new Event('notification-updated'))
  await fetchData()
}

async function markAllVisibleRead() {
  const unreadIds = unreadItems.value.map((item) => item.id)
  for (const id of unreadIds) {
    await markNotificationRead(id)
  }
  ElMessage.success('已全部标记已读')
  window.dispatchEvent(new Event('notification-updated'))
  await fetchData()
}

const unreadItems = computed(() => filteredData.value.filter((item) => !item.isRead))

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

.footer-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}
</style>
