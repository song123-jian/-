<template>
  <div class="page-container">
    <PageHeader title="质检记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增质检
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="结果">
        <el-select v-model="searchResult" placeholder="请选择" clearable>
          <el-option label="合格" value="pass" />
          <el-option label="不合格" value="fail" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="qcNo" label="质检单号" width="150" />
        <el-table-column prop="prodOrderNo" label="工单编号" width="150" />
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="inspectQty" label="检验数量" width="100" />
        <el-table-column prop="passQty" label="合格数量" width="100" />
        <el-table-column prop="defectQty" label="不良数量" width="100" />
        <el-table-column prop="result" label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.result === 'pass' ? 'success' : 'danger'">
              {{ row.result === 'pass' ? '合格' : '不合格' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="inspector" label="检验员" width="100" />
        <el-table-column prop="inspectDate" label="检验日期" width="120" />
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
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="工单" prop="prodOrderId">
          <el-input v-model="form.prodOrderId" placeholder="请输入工单编号" />
        </el-form-item>
        <el-form-item label="检验数量" prop="inspectQty">
          <el-input-number v-model="form.inspectQty" :min="0" />
        </el-form-item>
        <el-form-item label="合格数量" prop="passQty">
          <el-input-number v-model="form.passQty" :min="0" />
        </el-form-item>
        <el-form-item label="不良数量" prop="defectQty">
          <el-input-number v-model="form.defectQty" :min="0" />
        </el-form-item>
        <el-form-item label="检验日期" prop="inspectDate">
          <el-date-picker v-model="form.inspectDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入备注" />
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
import { getQcRecordList, createQcRecord, updateQcRecord, deleteQcRecord } from '@/api/qcRecord'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchResult = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增质检')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, prodOrderId: '', inspectQty: 0, passQty: 0, defectQty: 0, inspectDate: '', remark: '' })
const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请输入工单编号', trigger: 'blur' }],
  inspectQty: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getQcRecordList({ page: pagination.page, pageSize: pagination.pageSize, result: searchResult.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchResult.value = ''; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增质检'
  Object.assign(form, { id: 0, prodOrderId: '', inspectQty: 0, passQty: 0, defectQty: 0, inspectDate: '', remark: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑质检'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateQcRecord(form.id, form); ElMessage.success('更新成功') }
    else { await createQcRecord(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该质检记录？', '提示', { type: 'warning' })
  try { await deleteQcRecord(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
