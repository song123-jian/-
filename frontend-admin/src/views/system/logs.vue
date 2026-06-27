<template>
  <div class="page-container">
    <PageHeader title="操作日志">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset" />

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="操作人" width="120" />
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="action" label="操作" width="120" />
        <el-table-column prop="targetType" label="目标类型" width="120" />
        <el-table-column prop="targetId" label="目标ID" width="100" />
        <el-table-column prop="oldValue" label="变更前" min-width="200" show-overflow-tooltip />
        <el-table-column prop="newValue" label="变更后" min-width="200" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP地址" width="140" />
        <el-table-column prop="createdAt" label="操作时间" width="180" />
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getLogList } from '@/api/system'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchHint = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getLogList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchHint.value || undefined,
    })
    tableData.value = res.data?.records || res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchHint.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchHint.value = ''
  pagination.page = 1
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
