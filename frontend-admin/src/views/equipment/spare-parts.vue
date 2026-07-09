<template>
  <div class="page-container spare-parts-page">
    <PageHeader title="备件库存">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        新增备件
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

    <MetricStrip class="metric-section" :items="metricCards" testid="spare-parts-metrics" />

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <strong>备件台账</strong>
          <el-input v-model.trim="keyword" clearable placeholder="搜索编码、名称、规格" class="search-input" @keyup.enter="fetchData" />
        </div>
      </template>

      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无备件">
        <el-table-column prop="code" label="编码" width="130" show-overflow-tooltip />
        <el-table-column prop="name" label="名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="spec" label="规格" min-width="160" show-overflow-tooltip />
        <el-table-column prop="qty" label="库存" width="100" />
        <el-table-column prop="safeStock" label="安全库存" width="110" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column label="风险" width="110">
          <template #default="{ row }">
            <el-tag :type="isLowStock(row) ? 'danger' : 'success'" effect="plain">
              {{ isLowStock(row) ? '需补货' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="plain">
              {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-if="isLowStock(row)" type="warning" link @click="createReplenishTodo(row)">补货待办</el-button>
            <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑备件' : '新增备件'" width="620px">
      <el-form label-width="96px" :model="form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="编码">
              <el-input v-model.trim="form.code" placeholder="留空自动生成" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称" required>
              <el-input v-model.trim="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="规格">
              <el-input v-model.trim="form.spec" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="库存">
              <el-input-number v-model="form.qty" :min="0" :precision="3" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="安全库存">
              <el-input-number v-model="form.safeStock" :min="0" :precision="3" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单位">
              <el-input v-model.trim="form.unit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="启用" value="ACTIVE" />
                <el-option label="停用" value="INACTIVE" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model.trim="form.remark" type="textarea" :rows="3" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import { createInjectionRecord, deleteInjectionRecord, getInjectionList, runInjectionAction, updateInjectionRecord } from '@/api/injection'

const RESOURCE = 'spare-parts'
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const rows = ref<any[]>([])
const keyword = ref('')
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)

const form = reactive({
  code: '',
  name: '',
  spec: '',
  qty: 0,
  safeStock: 0,
  unit: 'pcs',
  status: 'ACTIVE',
  remark: '',
})

const summary = computed(() => ({
  total: rows.value.length,
  lowStock: rows.value.filter((row) => isLowStock(row)).length,
  active: rows.value.filter((row) => row.status === 'ACTIVE').length,
}))

const metricCards = computed(() => [
  { label: '备件种类', value: summary.value.total, meta: '当前备件档案数量', tone: 'primary' as const },
  { label: '低于安全库存', value: summary.value.lowStock, meta: '需要采购或调拨补充', tone: 'danger' as const },
  { label: '启用备件', value: summary.value.active, meta: '可用于维修领用', tone: 'success' as const },
])

function isLowStock(row: any) {
  return Number(row.qty || 0) <= Number(row.safeStock || 0)
}

function resetForm(row: any = {}) {
  Object.assign(form, {
    code: row.code || '',
    name: row.name || '',
    spec: row.spec || '',
    qty: Number(row.qty || 0),
    safeStock: Number(row.safeStock || row.safe_stock || 0),
    unit: row.unit || 'pcs',
    status: row.status || 'ACTIVE',
    remark: row.remark || '',
  })
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getInjectionList(RESOURCE, { page: 1, pageSize: 200, keyword: keyword.value || undefined })
    rows.value = res.data?.records || res.data || []
  } catch (error: any) {
    rows.value = []
    errorMessage.value = failureText(error, '备件库存加载失败，请检查 Supabase 连接和 spare_part 表结构。')
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: any) {
  editingId.value = Number(row.id)
  resetForm(row)
  dialogVisible.value = true
}

function buildCode() {
  const now = new Date()
  return `SP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
}

async function submitForm() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入备件名称')
    return
  }
  const payload = {
    code: form.code || buildCode(),
    name: form.name,
    spec: form.spec,
    qty: Number(form.qty || 0),
    safeStock: Number(form.safeStock || 0),
    unit: form.unit || 'pcs',
    status: form.status,
    remark: form.remark,
  }
  submitting.value = true
  try {
    if (editingId.value) await updateInjectionRecord(RESOURCE, editingId.value, payload)
    else await createInjectionRecord(RESOURCE, payload)
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, '备件保存失败，请检查编码、库存字段和 Supabase 写入权限。'))
  } finally {
    submitting.value = false
  }
}

async function createReplenishTodo(row: any) {
  try {
    await runInjectionAction(RESOURCE, Number(row.id), 'replenish')
    ElMessage.success('已生成补货待办')
  } catch (error: any) {
    ElMessage.error(failureText(error, '补货待办生成失败，请检查流程表和 Supabase 写入权限。'))
  }
}

async function removeRow(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除备件 ${row.name || row.code || row.id}？`, '删除备件', { type: 'warning' })
    await deleteInjectionRecord(RESOURCE, Number(row.id))
    ElMessage.success('删除成功')
    await fetchData()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(failureText(error, '备件删除失败，请检查 Supabase 删除权限或关联维修记录。'))
  }
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.search-input {
  width: 260px;
}

.page-alert {
  margin-bottom: 12px;
}
</style>
