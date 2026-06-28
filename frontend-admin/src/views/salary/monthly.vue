<template>
  <div class="page-container">
    <PageHeader title="月工资汇总">
      <el-button type="success" @click="handleSettle">
        <el-icon><Check /></el-icon>月度结算
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="月份">
        <el-date-picker v-model="searchMonth" type="month" placeholder="选择月份" value-format="YYYY-MM" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" show-summary>
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="workerName" label="员工" width="100" />
        <el-table-column prop="workDays" label="出勤天数" width="100" />
        <el-table-column prop="pieceAmount" label="计件工资" width="120" />
        <el-table-column prop="baseSalary" label="底薪" width="100" />
        <el-table-column prop="bonus" label="奖金" width="100" />
        <el-table-column prop="penalty" label="扣款" width="100" />
        <el-table-column prop="totalAmount" label="应发合计" width="120" />
        <el-table-column prop="month" label="月份" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'settled' ? 'success' : 'warning'">
              {{ row.status === 'settled' ? '已结算' : '未结算' }}
            </el-tag>
          </template>
        </el-table-column>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getMonthlySalaryList, settleMonthlySalary } from '@/api/salary'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchMonth = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getMonthlySalaryList({ page: pagination.page, pageSize: pagination.pageSize, month: searchMonth.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchMonth.value = ''; pagination.page = 1; fetchData() }

async function handleSettle() {
  await ElMessageBox.confirm('确定进行月度工资结算？', '提示', { type: 'warning' })
  try {
    await settleMonthlySalary({ month: searchMonth.value })
    ElMessage.success('结算成功')
    fetchData()
  } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
