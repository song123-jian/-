<template>
  <div class="page-container">
    <PageHeader title="库存查询" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="仓库ID">
        <el-input v-model="searchWarehouseId" placeholder="请输入仓库ID" clearable />
      </el-form-item>
      <el-form-item label="产品ID">
        <el-input v-model="searchProductId" placeholder="请输入产品ID" clearable />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="productCode" label="产品编码" width="120">
          <template #default="{ row }">
            {{ row.productCode || row.code || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="productName" label="产品名称" width="150" />
        <el-table-column prop="warehouseName" label="仓库" width="140" />
        <el-table-column prop="locationCode" label="库位" width="120" />
        <el-table-column prop="batchNo" label="批次" width="140" />
        <el-table-column prop="qty" label="库存数量" width="100">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="lockedQty" label="锁定数量" width="100">
          <template #default="{ row }">
            {{ Number(row.lockedQty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="availableQty" label="可用数量" width="100">
          <template #default="{ row }">
            <span :style="{ color: Number(row.availableQty || 0) <= 0 ? '#f56c6c' : '#67c23a' }">
              {{ Number(row.availableQty || 0).toFixed(0) }}
            </span>
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
import { getStockList } from '@/api/stock'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchWarehouseId = ref('')
const searchProductId = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      warehouseId: searchWarehouseId.value ? Number(searchWarehouseId.value) : undefined,
      productId: searchProductId.value ? Number(searchProductId.value) : undefined,
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
  if (formData.keyword) {
    searchProductId.value = formData.keyword
  }
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchWarehouseId.value = ''
  searchProductId.value = ''
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
