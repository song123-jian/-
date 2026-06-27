<template>
  <div class="page-container">
    <PageHeader title="库存台账" />

    <SearchBar @search="handleSearch" @reset="handleReset">
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
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="moveNo" label="流水号" width="160" />
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="warehouseName" label="仓库" width="140" />
        <el-table-column prop="locationCode" label="库位" width="120" />
        <el-table-column prop="batchNo" label="批次" width="140" />
        <el-table-column prop="moveType" label="类型" width="100" />
        <el-table-column prop="moveReason" label="原因" width="120" />
        <el-table-column prop="qty" label="数量" width="100" />
        <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
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
import { getStockLedger } from '@/api/stock'
import { formatDateTime } from '@/utils'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchDate = ref<string[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getStockLedger(params)
    tableData.value = res.data?.records || res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchDate.value = []
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
