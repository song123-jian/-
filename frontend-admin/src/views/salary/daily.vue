<template>
  <div class="page-container">
    <PageHeader title="日工资" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期">
        <el-date-picker v-model="searchDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" show-summary>
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="workerName" label="员工" width="100" />
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="processName" label="工序" width="120" />
        <el-table-column prop="quantity" label="完成数量" width="100" />
        <el-table-column prop="unitPrice" label="单价" width="100" />
        <el-table-column prop="amount" label="金额" width="100" />
        <el-table-column prop="date" label="日期" width="120" />
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
import { getDailySalaryList } from '@/api/salary'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchDate = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getDailySalaryList({ page: pagination.page, pageSize: pagination.pageSize, date: searchDate.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchDate.value = ''; pagination.page = 1; fetchData() }

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
