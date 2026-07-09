<template>
  <div class="page-container">
    <PageHeader title="模具保养记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增保养
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

    <el-dialog v-model="dialogVisible" title="新增模具保养" width="640px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="模具" prop="moldId">
              <el-select v-model="form.moldId" filterable placeholder="请选择模具" style="width: 100%">
                <el-option
                  v-for="item in moldOptions"
                  :key="item.id"
                  :label="moldLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="操作人" prop="operatorId">
              <el-select v-model="form.operatorId" filterable placeholder="请选择操作人" style="width: 100%">
                <el-option v-for="item in userOptions" :key="item.id" :label="item.realName || item.username" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="保养时间" prop="operateTime">
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
        <el-alert
          v-if="selectedMold"
          class="mold-state-alert"
          type="info"
          :title="selectedMoldText"
          show-icon
          :closable="false"
        />
        <el-form-item label="保养说明" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入保养内容、异常处理或备件更换情况" />
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
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getMoldList, maintainMold } from '@/api/mold'
import { getUserList } from '@/api/user'
import { getMoldMaintenanceRecordList } from '@/api/moldMaintenanceRecord'
import { useUserStore } from '@/store/user'

type OptionItem = {
  id: number
  code?: string
  name?: string
  realName?: string
  username?: string
  usedShots?: number
  shotsSinceMaintenance?: number
  maintenanceCount?: number
}

const userStore = useUserStore()
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const tableData = ref<any[]>([])
const searchMoldId = ref<number | null>(null)
const searchOperatorId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const moldOptions = ref<OptionItem[]>([])
const userOptions = ref<OptionItem[]>([])
const form = reactive({
  moldId: null as number | null,
  operatorId: null as number | null,
  operateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  remark: '',
})

const formRules: FormRules = {
  moldId: [{ required: true, message: '请选择模具', trigger: 'change' }],
  operatorId: [{ required: true, message: '请选择操作人', trigger: 'change' }],
  operateTime: [{ required: true, message: '请选择保养时间', trigger: 'change' }],
}

const selectedMold = computed(() =>
  moldOptions.value.find((item) => Number(item.id) === Number(form.moldId || 0))
)

const selectedMoldText = computed(() => {
  const mold = selectedMold.value
  if (!mold) return ''
  return `当前累计模次 ${Number(mold.usedShots || 0).toFixed(0)}，距上次保养 ${Number(mold.shotsSinceMaintenance || 0).toFixed(0)}，历史保养 ${Number(mold.maintenanceCount || 0).toFixed(0)} 次`
})

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

function moldLabel(item: OptionItem) {
  return [item.code, item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

async function loadOptions() {
  try {
    const [moldRes, userRes] = await Promise.all([
      getMoldList({ page: 1, pageSize: 200 }),
      getUserList({ page: 1, pageSize: 200 }),
    ])
    moldOptions.value = moldRes.data?.records || []
    userOptions.value = userRes.data?.records || []
  } catch (error: any) {
    moldOptions.value = []
    userOptions.value = []
    ElMessage.error(failureText(error, '模具保养基础选项加载失败，请检查模具和用户资料。'))
  }
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
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
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, '模具保养记录加载失败，请检查 Supabase 连接、保养记录表和筛选条件。')
    ElMessage.error(errorMessage.value)
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

function handleAdd() {
  form.moldId = null
  form.operatorId = userStore.userInfo?.id || null
  form.operateTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
  form.remark = ''
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !form.moldId) return

  submitting.value = true
  try {
    await maintainMold(Number(form.moldId), {
      operatorId: form.operatorId,
      operateTime: form.operateTime,
      remark: form.remark || undefined,
    })
    ElMessage.success('模具保养完成')
    dialogVisible.value = false
    await Promise.all([loadOptions(), fetchData()])
  } catch (error: any) {
    ElMessage.error(failureText(error, '模具保养提交失败，请检查模具状态、操作人和保养权限。'))
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

.page-alert,
.mold-state-alert {
  margin-bottom: 12px;
}
</style>
