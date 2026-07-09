<template>
  <div class="page-container">
    <PageHeader title="上下模记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增记录
      </el-button>
    </PageHeader>

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="模具">
        <el-select v-model="searchMoldId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in moldOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="机台">
        <el-select v-model="searchMachineId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in machineOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="searchMountType" placeholder="全部" clearable style="width: 140px">
          <el-option label="上模" value="MOUNT" />
          <el-option label="下模" value="DISMOUNT" />
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
        <el-table-column prop="operateTime" label="操作时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.operateTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="mountType" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="mountTypeTag(row.mountType)">
              {{ mountTypeText(row.mountType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="moldName" label="模具" width="150" />
        <el-table-column prop="machineName" label="机台" width="150" />
        <el-table-column prop="orderNo" label="工单编号" width="150" />
        <el-table-column prop="operatorName" label="操作人" width="120" />
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

    <el-dialog v-model="dialogVisible" title="新增上下模记录" width="720px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="模具" prop="moldId">
              <el-select v-model="form.moldId" filterable placeholder="请选择模具" style="width: 100%">
                <el-option v-for="item in moldOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="机台" prop="machineId">
              <el-select v-model="form.machineId" filterable placeholder="请选择机台" style="width: 100%">
                <el-option v-for="item in machineOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="工单" prop="prodOrderId">
              <el-select v-model="form.prodOrderId" filterable clearable placeholder="可选" style="width: 100%">
                <el-option v-for="item in orderOptions" :key="item.id" :label="item.orderNo" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="类型" prop="mountType">
              <el-select v-model="form.mountType" placeholder="请选择类型" style="width: 100%">
                <el-option label="上模" value="MOUNT" />
                <el-option label="下模" value="DISMOUNT" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="操作人" prop="operatorId">
              <el-select v-model="form.operatorId" filterable placeholder="请选择操作人" style="width: 100%">
                <el-option v-for="item in userOptions" :key="item.id" :label="item.realName || item.username" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="操作时间" prop="operateTime">
              <el-date-picker
                v-model="form.operateTime"
                type="datetime"
                placeholder="请选择时间"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { useUserStore } from '@/store/user'
import { getMoldList } from '@/api/mold'
import { getMachineList } from '@/api/machine'
import { getProdOrderList } from '@/api/prodOrder'
import { getUserList } from '@/api/user'
import { createMoldMountRecord, getMoldMountRecordList } from '@/api/moldMountRecord'

type OptionItem = { id: number; name?: string; orderNo?: string; realName?: string; username?: string }

const userStore = useUserStore()
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchMoldId = ref<number | null>(null)
const searchMachineId = ref<number | null>(null)
const searchMountType = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const moldOptions = ref<OptionItem[]>([])
const machineOptions = ref<OptionItem[]>([])
const orderOptions = ref<OptionItem[]>([])
const userOptions = ref<OptionItem[]>([])
const form = reactive({
  moldId: null as number | null,
  machineId: null as number | null,
  prodOrderId: null as number | null,
  mountType: 'MOUNT',
  operatorId: null as number | null,
  operateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  remark: '',
})

const formRules: FormRules = {
  moldId: [{ required: true, message: '请选择模具', trigger: 'change' }],
  machineId: [{ required: true, message: '请选择机台', trigger: 'change' }],
  mountType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  operatorId: [{ required: true, message: '请选择操作人', trigger: 'change' }],
  operateTime: [{ required: true, message: '请选择操作时间', trigger: 'change' }],
}

function mountTypeText(value?: string) {
  return value === 'DISMOUNT' ? '下模' : '上模'
}

function mountTypeTag(value?: string) {
  return value === 'DISMOUNT' ? 'warning' : 'success'
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

async function loadOptions() {
  try {
    const [moldRes, machineRes, orderRes, userRes] = await Promise.all([
      getMoldList({ page: 1, pageSize: 200 }),
      getMachineList({ page: 1, pageSize: 200 }),
      getProdOrderList({ page: 1, pageSize: 200 }),
      getUserList({ page: 1, pageSize: 200 }),
    ])
    moldOptions.value = moldRes.data?.records || []
    machineOptions.value = machineRes.data?.records || []
    orderOptions.value = orderRes.data?.records || []
    userOptions.value = userRes.data?.records || []
    if (!form.operatorId && userStore.userInfo?.id) {
      form.operatorId = userStore.userInfo.id
    }
  } catch (error: any) {
    moldOptions.value = []
    machineOptions.value = []
    orderOptions.value = []
    userOptions.value = []
    ElMessage.error(failureText(error, '上下模基础选项加载失败，请检查模具、机台、工单和用户资料。'))
  }
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value,
      moldId: searchMoldId.value || undefined,
      machineId: searchMachineId.value || undefined,
      mountType: searchMountType.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getMoldMountRecordList(params)
    tableData.value = res.data?.records || []
    pagination.total = res.data?.total || 0
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, '上下模记录加载失败，请检查 Supabase 连接、上下模记录表和筛选条件。')
    ElMessage.error(errorMessage.value)
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
  searchMoldId.value = null
  searchMachineId.value = null
  searchMountType.value = ''
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  form.moldId = null
  form.machineId = null
  form.prodOrderId = null
  form.mountType = 'MOUNT'
  form.operatorId = userStore.userInfo?.id || null
  form.operateTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
  form.remark = ''
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await createMoldMountRecord({ ...form })
    ElMessage.success('创建成功')
    dialogVisible.value = false
    fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, '上下模记录创建失败，请检查模具、机台、操作人和操作类型。'))
  } finally {
    submitting.value = false
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

.page-alert {
  margin-bottom: 12px;
}
</style>
