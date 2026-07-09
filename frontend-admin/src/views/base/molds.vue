<template>
  <MasterCrudPage :title="config.title" :subtitle="config.subtitle" :metrics="metrics">
    <template #toolbar>
      <el-button
        v-for="action in config.toolbarActions"
        :key="action.key"
        :type="action.type || 'default'"
        :plain="action.plain"
        :disabled="action.requiresSelection && selectedRows.length === 0"
        @click="handleToolbarAction(action.key)"
      >
        <el-icon v-if="action.icon"><component :is="action.icon" /></el-icon>
        {{ action.label }}
      </el-button>
      <input ref="fileInput" class="hidden-file-input" type="file" accept=".xlsx,.xls" @change="handleFileChange" />
    </template>

    <template #search>
      <SearchBar
        :keyword="searchKeyword"
        title="筛选模具"
        description="按模具关键字、状态和适配产品筛选模具资料。"
        @search="handleSearch"
        @reset="handleReset"
      >
        <template #default>
          <el-form-item v-for="field in config.searchFields" :key="field.prop" :label="field.label">
            <el-select
              v-if="field.type === 'select'"
              v-model="searchState[field.prop as keyof typeof searchState]"
              :placeholder="field.placeholder || '全部'"
              clearable
              :filterable="field.filterable"
              :style="{ width: field.width || '140px' }"
            >
              <el-option v-for="option in field.options || []" :key="String(option.value)" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
        </template>
      </SearchBar>
    </template>

    <template #table>
      <BaseCrudTable
        :config="config"
        :rows="tableData"
        :loading="loading"
        :pagination="pagination"
        action-label="操作"
        show-selection
        @selection-change="handleSelectionChange"
        @page-change="fetchData"
        @row-action="handleRowAction"
      />
    </template>

    <template #detail>
      <BaseCrudDetail :title="config.detailTitle" :empty-text="config.emptyDetailText" :row="selectedMold" :items="config.detailItems" />
    </template>

    <BaseCrudForm v-model="dialogVisible" :title="dialogTitle" :config="config" :model="form" :is-editing="!!form.id" :product-options="productOptions" @submit="handleSubmit" />

    <el-dialog v-model="statsVisible" title="模具统计" width="560px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="模具编号">{{ statsDetail.moldCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="模具名称">{{ statsDetail.moldName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="累计模次">{{ statsDetail.usedShots ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="距上次保养">{{ statsDetail.shotsSinceMaintenance ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="寿命">{{ statsDetail.lifetime ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="保养周期">{{ statsDetail.maintenanceCycle ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="剩余寿命">{{ statsDetail.remainingShots ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="下次保养">{{ statsDetail.remainingToMaintenance ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="保养次数">{{ statsDetail.maintenanceCount ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="使用率">{{ statsDetail.usageRate ?? 0 }}%</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </MasterCrudPage>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MasterCrudPage from '@/components/MasterCrudPage.vue'
import SearchBar from '@/components/SearchBar.vue'
import BaseCrudTable from '@/components/BaseCrudTable.vue'
import BaseCrudForm from '@/components/BaseCrudForm.vue'
import BaseCrudDetail from '@/components/BaseCrudDetail.vue'
import { exportData, importData } from '@/api/importExport'
import { createMold, deleteMold, getMoldList, getMoldShotsStats, maintainMold, updateMold } from '@/api/mold'
import { getProductList } from '@/api/product'
import { moldPageConfig as config } from '@/views/base/base-data-schema'
import { useBaseCrudPage } from '@/composables/useBaseCrudPage'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const statsVisible = ref(false)
const statsDetail = reactive<any>({})
const productOptions = ref<Array<{ label: string; value: string | number }>>([])

const {
  loading,
  tableData,
  selectedRow: selectedMold,
  selectedRows,
  dialogVisible,
  dialogTitle,
  searchKeyword,
  searchState,
  form,
  pagination,
  metrics,
  fetchData,
  handleSearch,
  handleReset,
  handleSelectionChange,
  openAdd: handleAdd,
  openEdit: handleEdit,
  submitForm: handleSubmit,
  deleteRow: handleDelete,
} = useBaseCrudPage({
  config,
  api: {
    list: getMoldList,
    create: createMold,
    update: updateMold,
    remove: deleteMold,
  },
  titles: {
    add: '新增模具',
    edit: '编辑模具',
  },
  messages: {
    createSuccess: '创建成功',
    updateSuccess: '更新成功',
    deleteSuccess: '删除成功',
  },
  deleteConfirmText: (row) => `确认删除模具 ${row.name}？`,
})

async function loadProducts() {
  try {
    const res: any = await getProductList({ page: 1, pageSize: 200 })
    const rows = res.data?.records || res.data?.list || []
    productOptions.value = rows.map((item: any) => ({ label: item.name, value: item.id }))
  } catch {
    productOptions.value = []
  }
}

async function handleToggle(row: any) {
  const nextStatus = row.status === 'SCRAP' ? 'NORMAL' : 'SCRAP'
  try {
    await updateMold(row.id, { status: nextStatus })
    ElMessage.success('状态已更新')
    fetchData()
  } catch {}
}

async function handleMaintain(row: any) {
  try {
    await maintainMold(row.id)
    ElMessage.success('保养完成')
    fetchData()
  } catch {}
}

async function handleStats(row: any) {
  try {
    const res: any = await getMoldShotsStats(row.id)
    Object.assign(statsDetail, res.data || {})
    statsVisible.value = true
  } catch {
    ElMessage.error('统计加载失败')
  }
}

async function handleBatchStatus(status: string) {
  if (selectedRows.value.length === 0) return
  try {
    for (const row of selectedRows.value) {
      await updateMold(row.id, { status })
    }
    ElMessage.success('批量更新成功')
    selectedRows.value = []
    fetchData()
  } catch {}
}

function handleImportClick() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await importData('mold', file)
    ElMessage.success('导入成功')
    fetchData()
  } catch {}
}

async function handleExport() {
  try {
    await exportData('mold', `模具导出_${Date.now()}.xlsx`)
  } catch {}
}

function goLogs() {
  router.push({ path: '/system/logs', query: { keyword: config.logKeyword } })
}

function goMaintenanceRecords() {
  router.push('/prod/mold-maintenance-records')
}

function handleInspect(row: any) {
  selectedMold.value = row
}

function handleRowAction(key: string, row: any) {
  if (key === 'inspect') return handleInspect(row)
  if (key === 'stats') return handleStats(row)
  if (key === 'maintain') return handleMaintain(row)
  if (key === 'toggle') return handleToggle(row)
  if (key === 'edit') return handleEdit(row)
  if (key === 'delete') return handleDelete(row)
}

async function handleToolbarAction(key: string) {
  if (key === 'add') return handleAdd()
  if (key === 'refresh') return fetchData()
  if (key === 'batch-enable') return handleBatchStatus('NORMAL')
  if (key === 'batch-disable') return handleBatchStatus('SCRAP')
  if (key === 'maintenance-records') return goMaintenanceRecords()
  if (key === 'import') return handleImportClick()
  if (key === 'export') return handleExport()
  if (key === 'logs') return goLogs()
}

onMounted(() => {
  loadProducts()
  fetchData()
})
</script>

<style scoped lang="scss">
.hidden-file-input {
  display: none;
}
</style>
