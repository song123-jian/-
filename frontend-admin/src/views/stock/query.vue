<template>
  <div class="page-container">
    <PageHeader title="库存查询" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="仓库">
        <el-input v-model="searchWarehouse" placeholder="请输入仓库" clearable />
      </el-form-item>
      <el-form-item label="产品">
        <el-input v-model="searchProduct" placeholder="请输入产品" clearable />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="productName" label="产品名称" width="150" />
        <el-table-column prop="productCode" label="产品编号" width="120" />
        <el-table-column prop="warehouseName" label="仓库" width="120" />
        <el-table-column prop="quantity" label="库存数量" width="100" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="safetyStock" label="安全库存" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.quantity <= row.safetyStock ? 'danger' : 'success'">
              {{ row.quantity <= row.safetyStock ? '库存不足' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180" />
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize"
        :total="pagination.total" :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper" class="pagination"
        @size-change="fetchData" @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getStockList } from '@/api/stock'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchWarehouse = ref('')
const searchProduct = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockList({ page: pagination.page, pageSize: pagination.pageSize, warehouse: searchWarehouse.value, product: searchProduct.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchWarehouse.value = ''; searchProduct.value = ''; pagination.page = 1; fetchData() }

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
