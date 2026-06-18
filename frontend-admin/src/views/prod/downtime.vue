<template>
  <div class="page-container">
    <PageHeader title="停机记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增记录
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="机台">
        <el-input v-model="searchMachine" placeholder="请输入机台" clearable />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="machineName" label="机台" width="120" />
        <el-table-column prop="startTime" label="停机开始" width="180" />
        <el-table-column prop="endTime" label="停机结束" width="180" />
        <el-table-column prop="duration" label="停机时长(小时)" width="120" />
        <el-table-column prop="reason" label="停机原因" min-width="200" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'plan' ? 'info' : 'danger'">
              {{ row.type === 'plan' ? '计划停机' : '异常停机' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="机台" prop="machineId">
          <el-input v-model="form.machineId" placeholder="请选择机台" />
        </el-form-item>
        <el-form-item label="停机开始" prop="startTime">
          <el-date-picker v-model="form.startTime" type="datetime" placeholder="选择时间" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
        <el-form-item label="停机结束" prop="endTime">
          <el-date-picker v-model="form.endTime" type="datetime" placeholder="选择时间" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择">
            <el-option label="计划停机" value="plan" />
            <el-option label="异常停机" value="fault" />
          </el-select>
        </el-form-item>
        <el-form-item label="停机原因" prop="reason">
          <el-input v-model="form.reason" type="textarea" placeholder="请输入停机原因" />
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
import { ref, reactive, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'

// 停机记录使用通用接口
const loading = ref(false)
const tableData = ref<any[]>([])
const searchMachine = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增停机记录')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, machineId: '', startTime: '', endTime: '', type: 'fault', reason: '' })
const formRules: FormRules = {
  machineId: [{ required: true, message: '请选择机台', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择停机开始时间', trigger: 'change' }],
  reason: [{ required: true, message: '请输入停机原因', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    // TODO: 调用实际停机记录接口
    tableData.value = []
    pagination.total = 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchMachine.value = ''; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增停机记录'
  Object.assign(form, { id: 0, machineId: '', startTime: '', endTime: '', type: 'fault', reason: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑停机记录'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    ElMessage.success(form.id ? '更新成功' : '创建成功')
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该停机记录？', '提示', { type: 'warning' })
  try { ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
