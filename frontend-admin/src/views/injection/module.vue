<template>
  <div class="page-container injection-page">
    <PageHeader :title="module.title">
      <el-button plain @click="loadData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        新增
      </el-button>
    </PageHeader>

    <div class="module-switcher">
      <button
        v-for="item in modules"
        :key="item.key"
        class="module-switcher__item"
        :class="{ active: item.key === module.key }"
        type="button"
        @click="router.push(`/injection/${item.key}`)"
      >
        <span>{{ item.order }}</span>
        {{ item.shortTitle }}
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span>全部记录</span>
        <strong>{{ summary.total }}</strong>
        <small>{{ module.shortTitle }} 数据</small>
      </div>
      <div class="kpi-card kpi-card--warning">
        <span>待处理</span>
        <strong>{{ summary.open }}</strong>
        <small>需分派、处理或审核</small>
      </div>
      <div class="kpi-card kpi-card--success">
        <span>已闭环</span>
        <strong>{{ summary.closed }}</strong>
        <small>完成、关闭或通过</small>
      </div>
      <div class="kpi-card kpi-card--danger">
        <span>风险项</span>
        <strong>{{ summary.risk }}</strong>
        <small>驳回、失败或严重异常</small>
      </div>
    </div>

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <div>
            <strong>{{ module.shortTitle }}</strong>
            <span>{{ module.description }}</span>
          </div>
          <el-input v-model.trim="keyword" clearable placeholder="搜索编号、名称、状态" class="search-input" @keyup.enter="loadData" />
        </div>
      </template>

      <el-table v-loading="loading" :data="rows" stripe row-key="id" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column
          v-for="field in module.listFields"
          :key="field.prop"
          :prop="field.prop"
          :label="field.label"
          min-width="130"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <el-tag v-if="field.prop === 'status'" :type="statusTagType(row.status)" effect="plain">
              {{ injectionStatusText(row.status) }}
            </el-tag>
            <span v-else>{{ displayValue(row[field.prop]) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170" show-overflow-tooltip />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-dropdown trigger="click" @command="(action: string) => runAction(row, action)">
              <el-button size="small" type="primary" link>流转</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="action in nextActions(row.status)" :key="action" :command="action">
                    {{ actionText(action) }}
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!nextActions(row.status).length" disabled>暂无动作</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" type="danger" link @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        class="pagination"
        layout="total, sizes, prev, pager, next"
        :total="pagination.total"
        @size-change="loadData"
        @current-change="loadData"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" destroy-on-close>
      <el-form label-width="120px" :model="form">
        <el-row :gutter="12">
          <el-col v-for="field in module.formFields" :key="field.prop" :span="field.type === 'textarea' ? 24 : 12">
            <el-form-item :label="field.label" :required="field.required">
              <el-input-number
                v-if="field.type === 'number'"
                v-model="form[field.prop]"
                :min="field.min"
                :max="field.max"
                controls-position="right"
                class="full-input"
              />
              <el-select v-else-if="field.type === 'select'" v-model="form[field.prop]" clearable class="full-input">
                <el-option v-for="option in field.options || []" :key="String(option.value)" :label="option.label" :value="option.value" />
              </el-select>
              <el-date-picker
                v-else-if="field.type === 'date' || field.type === 'datetime'"
                v-model="form[field.prop]"
                :type="field.type"
                value-format="YYYY-MM-DD HH:mm:ss"
                class="full-input"
              />
              <el-switch v-else-if="field.type === 'boolean'" v-model="form[field.prop]" />
              <el-input v-else-if="field.type === 'textarea'" v-model="form[field.prop]" type="textarea" :rows="3" />
              <el-input v-else v-model="form[field.prop]" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" class="full-input">
                <el-option v-for="option in module.statusOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import {
  INJECTION_MODULES,
  buildInjectionRecordPayload,
  getInjectionModuleByKey,
  getInjectionNextActions,
  injectionStatusText,
  summarizeInjectionRecords,
  validateInjectionRecord,
  type InjectionAction,
  type InjectionModuleKey,
} from '@/utils/injection-professional'
import {
  createInjectionRecord,
  deleteInjectionRecord,
  getInjectionList,
  runInjectionAction,
  updateInjectionRecord,
} from '@/api/injection'

const route = useRoute()
const router = useRouter()
const modules = INJECTION_MODULES
const loading = ref(false)
const rows = ref<any[]>([])
const keyword = ref('')
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<Record<string, any>>({})
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const module = computed(() => getInjectionModuleByKey(String(route.path.split('/').filter(Boolean).pop() || 'process-card')))
const summary = computed(() => summarizeInjectionRecords(rows.value))
const dialogTitle = computed(() => `${editingId.value ? '编辑' : '新增'}${module.value.shortTitle}`)

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function resetForm(source: Record<string, any> = {}) {
  Object.keys(form).forEach((key) => delete form[key])
  for (const field of module.value.formFields) {
    if (source[field.prop] !== undefined) form[field.prop] = source[field.prop]
    else if (field.type === 'boolean') form[field.prop] = true
    else form[field.prop] = field.type === 'number' ? undefined : ''
  }
  form.status = source.status || module.value.statusOptions[0]?.value || 'DRAFT'
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await getInjectionList(module.value.resource, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: keyword.value,
    })
    rows.value = unwrapRecords(res)
    pagination.total = Number(res?.data?.total || rows.value.length)
  } catch {
    rows.value = []
    pagination.total = 0
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

async function submitForm() {
  const moduleKey = module.value.key as InjectionModuleKey
  const message = validateInjectionRecord(moduleKey, form)
  if (message) {
    ElMessage.warning(message)
    return
  }
  const payload = buildInjectionRecordPayload(moduleKey, form)
  if (editingId.value) await updateInjectionRecord(module.value.resource, editingId.value, payload)
  else await createInjectionRecord(module.value.resource, payload)
  ElMessage.success('保存成功')
  dialogVisible.value = false
  await loadData()
}

async function removeRow(row: any) {
  await ElMessageBox.confirm(`确认删除 ${displayValue(row[module.value.codeField] || row.id)}？`, '提示', { type: 'warning' })
  await deleteInjectionRecord(module.value.resource, Number(row.id))
  ElMessage.success('删除成功')
  await loadData()
}

function nextActions(status: string) {
  return getInjectionNextActions(status)
}

async function runAction(row: any, action: string) {
  await runInjectionAction(module.value.resource, Number(row.id), action)
  ElMessage.success(`${actionText(action as InjectionAction)}成功`)
  await loadData()
}

function displayValue(value: unknown) {
  if (value === true) return '是'
  if (value === false) return '否'
  return String(value ?? '') || '-'
}

function statusTagType(status?: string) {
  const value = String(status || '').toUpperCase()
  if (['FAILED', 'REJECTED', 'OPEN', 'REPORTED', 'OVERDUE'].includes(value)) return 'danger'
  if (['SUBMITTED', 'ASSIGNED', 'PROCESSING', 'WAIT_CONFIRM', 'TRIALING', 'WARNING'].includes(value)) return 'warning'
  if (['APPROVED', 'ACTIVE', 'PASSED', 'CLOSED', 'FINISHED', 'APPROVED_PRODUCTION', 'NORMAL', 'GENERATED'].includes(value)) return 'success'
  return 'info'
}

function actionText(action: InjectionAction | string) {
  const labels: Record<string, string> = {
    submit: '提交', approve: '审核', reject: '驳回', assign: '分派', start: '开始', finish: '完成', close: '关闭', print: '打印', generate: '生成',
  }
  return labels[action] || action
}

watch(() => route.path, () => {
  pagination.page = 1
  resetForm()
  loadData()
})

onMounted(() => {
  resetForm()
  loadData()
})
</script>

<style scoped lang="scss">
.injection-page {
  .module-switcher {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin-bottom: 14px;
    padding-bottom: 4px;
  }

  .module-switcher__item {
    flex: 0 0 auto;
    border: 1px solid #dfe5ec;
    border-radius: 6px;
    background: #fff;
    color: #526071;
    cursor: pointer;
    padding: 8px 10px;
    font-size: 13px;

    span {
      margin-right: 4px;
      color: #0f766e;
      font-weight: 700;
    }

    &.active {
      border-color: #0f766e;
      background: #eef7f6;
      color: #0f3f3a;
      font-weight: 700;
    }
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .kpi-card {
    display: grid;
    gap: 6px;
    border: 1px solid #e4e7ed;
    border-left: 4px solid #409eff;
    border-radius: 6px;
    background: #fff;
    padding: 14px;

    span,
    small {
      color: #606266;
    }

    strong {
      color: #303133;
      font-size: 24px;
      line-height: 1.2;
    }
  }

  .kpi-card--warning { border-left-color: #e6a23c; }
  .kpi-card--success { border-left-color: #67c23a; }
  .kpi-card--danger { border-left-color: #f56c6c; }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    div {
      display: grid;
      gap: 4px;
    }

    span {
      color: #606266;
      font-size: 13px;
    }
  }

  .search-input {
    width: 260px;
  }

  .pagination {
    justify-content: flex-end;
    margin-top: 14px;
  }

  .full-input {
    width: 100%;
  }
}
</style>
