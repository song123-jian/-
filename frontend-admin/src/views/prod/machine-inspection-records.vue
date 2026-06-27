<template>
  <div class="page-container">
    <PageHeader title="设备点检记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增记录
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="机台">
        <el-select v-model="searchMachineId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in machineOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="点检人">
        <el-select v-model="searchInspectorId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in userOptions" :key="item.id" :label="item.realName || item.username" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="结果">
        <el-select v-model="searchResult" placeholder="全部" clearable style="width: 140px">
          <el-option label="正常" value="PASS" />
          <el-option label="异常" value="FAIL" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="inspectTime" label="点检时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.inspectTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="machineName" label="机台" width="160" />
        <el-table-column prop="inspectorName" label="点检人" width="120" />
        <el-table-column prop="result" label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.result === 'PASS' ? 'success' : 'danger'">
              {{ row.result === 'PASS' ? '正常' : '异常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="itemsChecked" label="点检项目" min-width="220" show-overflow-tooltip />
        <el-table-column prop="issues" label="异常" min-width="220" show-overflow-tooltip />
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
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

    <el-dialog v-model="dialogVisible" title="新增设备点检记录" width="720px">
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
            <el-form-item label="点检人" prop="inspectorId">
              <el-select v-model="form.inspectorId" filterable placeholder="请选择点检人" style="width: 100%">
                <el-option v-for="item in userOptions" :key="item.id" :label="item.realName || item.username" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="点检时间" prop="inspectTime">
              <el-date-picker
                v-model="form.inspectTime"
                type="datetime"
                placeholder="请选择时间"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结果" prop="result">
              <el-select v-model="form.result" placeholder="请选择结果" style="width: 100%">
                <el-option label="正常" value="PASS" />
                <el-option label="异常" value="FAIL" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="点检项目" prop="itemsChecked">
          <el-input v-model="form.itemsChecked" type="textarea" :rows="3" placeholder="请输入点检项目" />
        </el-form-item>
        <el-form-item label="异常描述" prop="issues">
          <el-input v-model="form.issues" type="textarea" :rows="3" placeholder="请输入异常描述" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="请输入备注" />
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
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { useUserStore } from '@/store/user'
import { getMachineList } from '@/api/machine'
import { getUserList } from '@/api/user'
import { createMachineInspectionRecord, getMachineInspectionRecordList } from '@/api/machineInspectionRecord'

type OptionItem = { id: number; name?: string; realName?: string; username?: string }

const userStore = useUserStore()
const loading = ref(false)
const tableData = ref<any[]>([])
const searchMachineId = ref<number | null>(null)
const searchInspectorId = ref<number | null>(null)
const searchResult = ref('')
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const machineOptions = ref<OptionItem[]>([])
const userOptions = ref<OptionItem[]>([])
const form = reactive({
  machineId: null as number | null,
  inspectorId: null as number | null,
  inspectTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  result: 'PASS',
  itemsChecked: '',
  issues: '',
  remark: '',
})

const formRules: FormRules = {
  machineId: [{ required: true, message: '请选择机台', trigger: 'change' }],
  inspectorId: [{ required: true, message: '请选择点检人', trigger: 'change' }],
  inspectTime: [{ required: true, message: '请选择点检时间', trigger: 'change' }],
  result: [{ required: true, message: '请选择结果', trigger: 'change' }],
}

async function loadOptions() {
  try {
    const [machineRes, userRes] = await Promise.all([
      getMachineList({ page: 1, pageSize: 200 }),
      getUserList({ page: 1, pageSize: 200 }),
    ])
    machineOptions.value = machineRes.data?.records || []
    userOptions.value = userRes.data?.records || []
    if (!form.inspectorId && userStore.userInfo?.id) {
      form.inspectorId = userStore.userInfo.id
    }
  } catch {
    machineOptions.value = []
    userOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getMachineInspectionRecordList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      machineId: searchMachineId.value || undefined,
      inspectorId: searchInspectorId.value || undefined,
      result: searchResult.value || undefined,
    })
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
  searchMachineId.value = null
  searchInspectorId.value = null
  searchResult.value = ''
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  form.machineId = null
  form.inspectorId = userStore.userInfo?.id || null
  form.inspectTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
  form.result = 'PASS'
  form.itemsChecked = ''
  form.issues = ''
  form.remark = ''
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await createMachineInspectionRecord({ ...form })
    ElMessage.success('创建成功')
    dialogVisible.value = false
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
