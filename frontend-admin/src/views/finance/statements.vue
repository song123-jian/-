<template>
  <div class="page-container">
    <PageHeader title="对账单" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="客户">
        <el-input v-model="searchCustomer" placeholder="请输入客户" clearable />
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker v-model="searchDate" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" show-summary>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="customerName" label="客户" width="120" />
        <el-table-column prop="orderNo" label="订单编号" width="150" />
        <el-table-column prop="orderAmount" label="订单金额" width="120" />
        <el-table-column prop="paidAmount" label="已回款" width="120" />
        <el-table-column prop="unpaidAmount" label="未回款" width="120">
          <template #default="{ row }">
            <span :style="{ color: row.unpaidAmount > 0 ? '#f56c6c' : '#67c23a' }">{{ row.unpaidAmount }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="orderDate" label="订单日期" width="120" />
        <el-table-column prop="lastPaymentDate" label="最近回款" width="120" />
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

const loading = ref(false)
const tableData = ref<any[]>([])
const searchCustomer = ref('')
const searchDate = ref<string[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try { tableData.value = []; pagination.total = 0 } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchCustomer.value = ''; searchDate.value = []; pagination.page = 1; fetchData() }

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
