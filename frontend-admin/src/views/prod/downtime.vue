<template>
  <div class="page-container">
    <PageHeader title="停机记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增记录
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="机台">
        <el-select v-model="searchMachineId" filterable clearable placeholder="全部" style="width: 180px">
          <el-option v-for="item in machineOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="searchDowntimeType" placeholder="全部" clearable style="width: 140px">
          <el-option label="计划停机" value="PLAN" />
          <el-option label="异常停机" value="FAULT" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker
          v-model="searchDateRange"
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
        <el-table-column prop="machineName" label="机台" width="120" />
        <el-table-column prop="orderNo" label="工单" width="150" />
        <el-table-column prop="reasonLabel" label="停机原因" width="120" />
        <el-table-column prop="downtimeType" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.downtimeType === 'PLAN' ? 'info' : 'danger'">
              {{ row.downtimeType === 'PLAN' ? '计划停机' : '异常停机' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startTime" label="停机开始" width="180">
          <template #default="{ row }">
            {{ formatValue(row.startTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="endTime" label="停机结束" width="180">
          <template #default="{ row }">
            {{ formatValue(row.endTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="durationMinutes" label="停机时长(分)" width="120" />
        <el-table-column prop="operatorName" label="操作人" width="120" />
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="机台" prop="machineId">
              <el-select v-model="form.machineId" filterable placeholder="请选择机台" style="width: 100%">
                <el-option v-for="item in machineOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工单ID">
              <el-input-number v-model="form.prodOrderId" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="原因" prop="reason">
              <el-select v-model="form.reason" placeholder="请选择原因" style="width: 100%">
                <el-option label="换模" value="MOLD_CHANGE" />
                <el-option label="缺料" value="MATERIAL_SHORTAGE" />
                <el-option label="品质问题" value="QUALITY_ISSUE" />
                <el-option label="设备故障" value="EQUIPMENT_FAULT" />
                <el-option label="休息" value="BREAK" />
                <el-option label="其他" value="OTHER" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="停机开始" prop="startTime">
              <el-date-picker
                v-model="form.startTime"
                type="datetime"
                placeholder="选择时间"
                value-format="YYYY-MM-DDTHH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="停机结束">
              <el-date-picker
                v-model="form.endTime"
                type="datetime"
                placeholder="选择时间"
                value-format="YYYY-MM-DDTHH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getMachineList } from '@/api/machine'
import { createDowntimeRecord, deleteDowntimeRecord, getDowntimeRecordList, updateDowntimeRecord } from '@/api/downtime'

type MachineOption = { id: number; name?: string }

const loading = ref(false)
const tableData = ref<any[]>([])
const machineOptions = ref<MachineOption[]>([])
const searchKeyword = ref('')
const searchMachineId = ref<number | null>(null)
const searchDowntimeType = ref('')
const searchDateRange = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增停机记录')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({
  id: 0,
  machineId: null as number | null,
  prodOrderId: null as number | null,
  reason: 'EQUIPMENT_FAULT',
  startTime: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
  endTime: '',
  remark: '',
})

const formRules: FormRules = {
  machineId: [{ required: true, message: '请选择机台', trigger: 'change' }],
  reason: [{ required: true, message: '请选择停机原因', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择停机开始时间', trigger: 'change' }],
}

function formatValue(value: string | null | undefined) {
  if (!value) return '-'
  return formatDateTime(value)
}

async function loadOptions() {
  try {
    const res: any = await getMachineList({ page: 1, pageSize: 200 })
    machineOptions.value = res.data?.records || res.data?.list || []
  } catch {
    machineOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getDowntimeRecordList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      machineId: searchMachineId.value || undefined,
      downtimeType: searchDowntimeType.value || undefined,
      startDate: searchDateRange.value?.[0],
      endDate: searchDateRange.value?.[1],
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
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchMachineId.value = null
  searchDowntimeType.value = ''
  searchDateRange.value = []
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增停机记录'
  Object.assign(form, {
    id: 0,
    machineId: null,
    prodOrderId: null,
    reason: 'EQUIPMENT_FAULT',
    startTime: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    endTime: '',
    remark: '',
  })
  dialogVisible.value = true
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑停机记录'
  Object.assign(form, {
    id: row.id,
    machineId: row.machineId ?? null,
    prodOrderId: row.prodOrderId ?? null,
    reason: row.reason || 'EQUIPMENT_FAULT',
    startTime: row.startTime || dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    endTime: row.endTime || '',
    remark: row.remark || '',
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (form.endTime && form.startTime && dayjs(form.endTime).isBefore(dayjs(form.startTime))) {
    ElMessage.warning('停机结束时间不能早于开始时间')
    return
  }
  try {
    const payload = {
      machineId: form.machineId,
      prodOrderId: form.prodOrderId ?? undefined,
      reason: form.reason,
      startTime: form.startTime,
      endTime: form.endTime || undefined,
      remark: form.remark || undefined,
    }
    if (form.id) {
      await updateDowntimeRecord(form.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createDowntimeRecord(payload)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 交给全局提示
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该停机记录？', '提示', { type: 'warning' })
    await deleteDowntimeRecord(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 交给全局提示
  }
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
