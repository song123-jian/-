<template>
  <div class="page-container">
    <PageHeader title="质检记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增质检
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
      <el-form-item label="检验结果">
        <el-select v-model="searchResult" placeholder="全部" clearable style="width: 160px">
          <el-option label="合格" value="PASS" />
          <el-option label="不合格" value="FAIL" />
          <el-option label="让步接收" value="CONDITIONAL" />
        </el-select>
      </el-form-item>
      <el-form-item label="检验类型">
        <el-select v-model="searchType" placeholder="全部" clearable style="width: 160px">
          <el-option label="来料检验" value="IQC" />
          <el-option label="首件检验" value="FAI" />
          <el-option label="过程检验" value="IPQC" />
          <el-option label="成品检验" value="FQC" />
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
        <el-table-column prop="orderNo" label="工单编号" width="150" />
        <el-table-column prop="productName" label="产品" width="140" />
        <el-table-column prop="checkType" label="检验类型" width="110">
          <template #default="{ row }">
            {{ checkTypeText(row.checkType) }}
          </template>
        </el-table-column>
        <el-table-column prop="checkResult" label="结果" width="110">
          <template #default="{ row }">
            <el-tag :type="resultTagType(row.checkResult)">
              {{ resultText(row.checkResult) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="defectType" label="缺陷类型" width="120" />
        <el-table-column prop="defectQty" label="缺陷数量" width="100" />
        <el-table-column prop="sampleQty" label="抽样数量" width="100" />
        <el-table-column prop="checkerName" label="检验员" width="100" />
        <el-table-column prop="createdAt" label="检验时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="生产工单" prop="prodOrderId">
              <el-select v-model="form.prodOrderId" filterable placeholder="请选择工单" style="width: 100%">
                <el-option
                  v-for="item in prodOrderOptions"
                  :key="item.id"
                  :label="item.orderNo"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品" prop="productId">
              <el-select v-model="form.productId" filterable placeholder="请选择产品" style="width: 100%">
                <el-option
                  v-for="item in productOptions"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="检验类型" prop="checkType">
              <el-select v-model="form.checkType" placeholder="请选择类型" style="width: 100%">
                <el-option label="来料检验" value="IQC" />
                <el-option label="首件检验" value="FAI" />
                <el-option label="过程检验" value="IPQC" />
                <el-option label="成品检验" value="FQC" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="检验结果" prop="checkResult">
              <el-select v-model="form.checkResult" placeholder="请选择结果" style="width: 100%">
                <el-option label="合格" value="PASS" />
                <el-option label="不合格" value="FAIL" />
                <el-option label="让步接收" value="CONDITIONAL" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="缺陷类型" prop="defectType">
              <el-input v-model="form.defectType" placeholder="请输入缺陷类型" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="缺陷数量" prop="defectQty">
              <el-input-number v-model="form.defectQty" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="抽样数量" prop="sampleQty">
              <el-input-number v-model="form.sampleQty" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="图片地址" prop="imageUrls">
              <el-input v-model="form.imageUrls" placeholder="多张请用逗号分隔" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="缺陷描述" prop="defectDesc">
          <el-input v-model="form.defectDesc" type="textarea" :rows="3" placeholder="请输入缺陷描述" />
        </el-form-item>

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
import { useRoute } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getQcRecordList, createQcRecord, updateQcRecord, deleteQcRecord } from '@/api/qcRecord'
import { getProductList } from '@/api/product'
import { getProdOrderList } from '@/api/prodOrder'

type OptionItem = { id: number; orderNo?: string; name?: string }

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchResult = ref('')
const searchType = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增质检')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const productOptions = ref<OptionItem[]>([])
const prodOrderOptions = ref<OptionItem[]>([])
const form = reactive({
  id: 0,
  prodOrderId: null as number | null,
  productId: null as number | null,
  checkType: '',
  checkResult: '',
  defectType: '',
  defectDesc: '',
  defectQty: 0,
  sampleQty: 0,
  imageUrls: '',
  remark: '',
})

const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请选择生产工单', trigger: 'change' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  checkType: [{ required: true, message: '请选择检验类型', trigger: 'change' }],
  checkResult: [{ required: true, message: '请选择检验结果', trigger: 'change' }],
  sampleQty: [{ required: true, message: '请输入抽样数量', trigger: 'blur' }],
  defectQty: [{ required: true, message: '请输入缺陷数量', trigger: 'blur' }],
}

function checkTypeText(value?: string) {
  const map: Record<string, string> = {
    IQC: '来料检验',
    FAI: '首件检验',
    IPQC: '过程检验',
    FQC: '成品检验',
  }
  return map[value || ''] || value || '-'
}

function resultText(value?: string) {
  const map: Record<string, string> = {
    PASS: '合格',
    FAIL: '不合格',
    CONDITIONAL: '让步接收',
  }
  return map[value || ''] || value || '-'
}

function resultTagType(value?: string) {
  if (value === 'PASS') return 'success'
  if (value === 'FAIL') return 'danger'
  return 'warning'
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

async function loadOptions() {
  try {
    const [productRes, orderRes] = await Promise.all([
      getProductList({ page: 1, pageSize: 200 }),
      getProdOrderList({ page: 1, pageSize: 200 }),
    ])

    productOptions.value = productRes.data?.records || []
    prodOrderOptions.value = orderRes.data?.records || []
  } catch (error: any) {
    productOptions.value = []
    prodOrderOptions.value = []
    ElMessage.error(failureText(error, '质检基础选项加载失败，请检查产品和生产工单资料。'))
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
      checkResult: searchResult.value,
      checkType: searchType.value,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }

    const res: any = await getQcRecordList(params)
    tableData.value = res.data?.records || []
    pagination.total = res.data?.total || 0
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, '质检记录加载失败，请检查 Supabase 连接、qc_record 表和筛选条件。')
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
  searchResult.value = ''
  searchType.value = ''
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function resetForm() {
  Object.assign(form, {
    id: 0,
    prodOrderId: null,
    productId: null,
    checkType: '',
    checkResult: '',
    defectType: '',
    defectDesc: '',
    defectQty: 0,
    sampleQty: 0,
    imageUrls: '',
    remark: '',
  })
}

function handleAdd(defaults: Partial<typeof form> = {}) {
  dialogTitle.value = '新增质检'
  resetForm()
  Object.assign(form, defaults)
  dialogVisible.value = true
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑质检'
  Object.assign(form, {
    id: row.id || 0,
    prodOrderId: row.prodOrderId ?? null,
    productId: row.productId ?? null,
    checkType: row.checkType || '',
    checkResult: row.checkResult || '',
    defectType: row.defectType || '',
    defectDesc: row.defectDesc || '',
    defectQty: row.defectQty ?? 0,
    sampleQty: row.sampleQty ?? 0,
    imageUrls: row.imageUrls || '',
    remark: row.remark || '',
  })
  dialogVisible.value = true
}

function validateTraceableForm() {
  if (Number(form.sampleQty || 0) <= 0) {
    ElMessage.warning('抽样数量必须大于 0')
    return false
  }
  if (Number(form.defectQty || 0) < 0) {
    ElMessage.warning('不良数量不能小于 0')
    return false
  }
  if (Number(form.defectQty || 0) > Number(form.sampleQty || 0)) {
    ElMessage.warning('不良数量不能超过抽样数量')
    return false
  }
  if (form.checkResult === 'FAIL') {
    if (!form.defectType.trim()) {
      ElMessage.warning('不合格质检必须填写缺陷类型')
      return false
    }
    if (!form.defectDesc.trim()) {
      ElMessage.warning('不合格质检必须填写缺陷描述')
      return false
    }
    if (Number(form.defectQty || 0) <= 0) {
      ElMessage.warning('不合格质检必须填写大于 0 的不良数量')
      return false
    }
  }
  return true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!validateTraceableForm()) return

  submitting.value = true
  try {
    const payload = {
      prodOrderId: form.prodOrderId,
      productId: form.productId,
      checkType: form.checkType,
      checkResult: form.checkResult,
      defectType: form.defectType,
      defectDesc: form.defectDesc,
      defectQty: form.defectQty,
      sampleQty: form.sampleQty,
      imageUrls: form.imageUrls,
      remark: form.remark,
    }

    if (form.id) {
      await updateQcRecord(form.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createQcRecord(payload)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    await fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, form.id ? '质检记录更新失败，请检查工单、产品、抽样数量和缺陷信息。' : '质检记录创建失败，请检查工单、产品、抽样数量和缺陷信息。'))
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该质检记录？', '提示', { type: 'warning' })
    await deleteQcRecord(row.id)
    ElMessage.success('删除成功')
    await fetchData()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(failureText(error, '质检记录删除失败，请检查记录状态或数据库权限。'))
  }
}

onMounted(async () => {
  await loadOptions()
  await fetchData()
  const queryCheckType = typeof route.query.checkType === 'string' ? route.query.checkType : ''
  if (route.query.action === 'create' && queryCheckType) {
    handleAdd({ checkType: queryCheckType })
  }
})
</script>

<style scoped lang="scss">
.page-alert {
  margin-bottom: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
