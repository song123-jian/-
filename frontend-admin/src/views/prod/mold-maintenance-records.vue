<template>
  <div class="page-container">
    <PageHeader title="模具保养记录" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="模具">
        <el-select v-model="searchMoldId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in moldOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="操作人">
        <el-select v-model="searchOperatorId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in userOptions" :key="item.id" :label="item.realName || item.username" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期范围">
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
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="operateTime" label="保养时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.operateTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="moldName" label="模具" width="160" />
        <el-table-column prop="operatorName" label="操作人" width="140" />
        <el-table-column prop="usedShotsBefore" label="保养前累计模次" width="130" />
        <el-table-column prop="shotsSinceMaintenanceBefore" label="保养前模次" width="110" />
        <el-table-column prop="maintenanceCountBefore" label="保养前次数" width="100" />
        <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
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
import { formatDateTime } from '@/utils'
import { getMoldList } from '@/api/mold'
import { getUserList } from '@/api/user'
import { getMoldMaintenanceRecordList } from '@/api/moldMaintenanceRecord'

type OptionItem = { id: number; name?: string; realName?: string; username?: string }

const loading = ref(false)
const tableData = ref<any[]>([])
const searchMoldId = ref<number | null>(null)
const searchOperatorId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const moldOptions = ref<OptionItem[]>([])
const userOptions = ref<OptionItem[]>([])

async function loadOptions() {
  try {
    const [moldRes, userRes] = await Promise.all([
      getMoldList({ page: 1, pageSize: 200 }),
      getUserList({ page: 1, pageSize: 200 }),
    ])
    moldOptions.value = moldRes.data?.records || []
    userOptions.value = userRes.data?.records || []
  } catch {
    moldOptions.value = []
    userOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      moldId: searchMoldId.value || undefined,
      operatorId: searchOperatorId.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getMoldMaintenanceRecordList(params)
    tableData.value = res.data?.records || []
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
  searchMoldId.value = null
  searchOperatorId.value = null
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

onMounted(async () => {
  await loadOptions()
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
