<template>
  <MasterCrudPage :title="config.title" :metrics="metrics">
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
      <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
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
            <el-input
              v-else
              v-model="searchState[field.prop as keyof typeof searchState]"
              :placeholder="field.placeholder || '请输入'"
              clearable
              :style="{ width: field.width || '180px' }"
            />
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
      <BaseCrudDetail :title="config.detailTitle" :empty-text="config.emptyDetailText" :row="selectedMachine" :items="config.detailItems" />
    </template>

    <BaseCrudForm v-model="dialogVisible" :title="dialogTitle" :config="config" :model="form" :is-editing="!!form.id" @submit="handleSubmit" />

    <el-dialog v-model="qrVisible" title="机台二维码" width="420px">
      <div v-if="qrCode" class="qr-box">
        <img :src="qrCode" alt="机台二维码" />
      </div>
      <el-empty v-else description="暂无二维码" />
    </el-dialog>
  </MasterCrudPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MasterCrudPage from '@/components/MasterCrudPage.vue'
import SearchBar from '@/components/SearchBar.vue'
import BaseCrudTable from '@/components/BaseCrudTable.vue'
import BaseCrudForm from '@/components/BaseCrudForm.vue'
import BaseCrudDetail from '@/components/BaseCrudDetail.vue'
import { exportData, importData } from '@/api/importExport'
import { createMachine, deleteMachine, getMachineList, getMachineQrCode, updateMachine } from '@/api/machine'
import { machinePageConfig as baseConfig } from '@/views/base/base-data-schema'
import { useBaseCrudPage } from '@/composables/useBaseCrudPage'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const qrVisible = ref(false)
const qrCode = ref('')

const config = {
  ...baseConfig,
  toolbarActions: baseConfig.toolbarActions.map((action) => {
    if (action.key === 'batch-enable') {
      return { ...action, label: '批量开机' }
    }
    if (action.key === 'batch-stop') {
      return { ...action, label: '批量停机' }
    }
    return action
  }),
  rowActions: baseConfig.rowActions.map((action) => {
    if (action.key === 'toggle') {
      return {
        ...action,
        label: (row: any) => (row.status === 'RUNNING' ? '停机' : '开机'),
      }
    }
    return action
  }),
}

const {
  loading,
  tableData,
  selectedRow: selectedMachine,
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
    list: getMachineList,
    create: createMachine,
    update: updateMachine,
    remove: deleteMachine,
  },
  titles: {
    add: '新增机台',
    edit: '编辑机台',
  },
  messages: {
    createSuccess: '创建成功',
    updateSuccess: '更新成功',
    deleteSuccess: '删除成功',
  },
  deleteConfirmText: (row) => `确认删除机台 ${row.name}？`,
})

async function handleToggle(row: any) {
  const nextStatus = row.status === 'RUNNING' ? 'STOPPED' : 'RUNNING'
  try {
    await updateMachine(row.id, { status: nextStatus })
    ElMessage.success('状态已更新')
    await fetchData()
  } catch {
    ElMessage.error('状态更新失败')
  }
}

async function handleQr(row: any) {
  try {
    const res: any = await getMachineQrCode(row.id)
    qrCode.value = res.data || ''
    qrVisible.value = true
  } catch {
    ElMessage.error('二维码生成失败')
  }
}

async function handleBatchStatus(status: string) {
  if (selectedRows.value.length === 0) return
  try {
    for (const row of selectedRows.value) {
      await updateMachine(row.id, { status })
    }
    ElMessage.success('批量更新成功')
    selectedRows.value = []
    await fetchData()
  } catch {
    ElMessage.error('批量更新失败')
  }
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
    await importData('machine', file)
    ElMessage.success('导入成功')
    await fetchData()
  } catch {
    ElMessage.error('导入失败')
  }
}

async function handleExport() {
  try {
    await exportData('machine', `机台导出_${Date.now()}.xlsx`)
  } catch {
    ElMessage.error('导出失败')
  }
}

function goLogs() {
  router.push({ path: '/system/logs', query: { keyword: config.logKeyword } })
}

function handleInspect(row: any) {
  selectedMachine.value = row
}

function handleRowAction(key: string, row: any) {
  if (key === 'inspect') return handleInspect(row)
  if (key === 'toggle') return handleToggle(row)
  if (key === 'qrcode') return handleQr(row)
  if (key === 'edit') return handleEdit(row)
  if (key === 'delete') return handleDelete(row)
}

async function handleToolbarAction(key: string) {
  if (key === 'add') return handleAdd()
  if (key === 'refresh') return fetchData()
  if (key === 'batch-enable') return handleBatchStatus('RUNNING')
  if (key === 'batch-stop') return handleBatchStatus('STOPPED')
  if (key === 'import') return handleImportClick()
  if (key === 'export') return handleExport()
  if (key === 'logs') return goLogs()
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.hidden-file-input {
  display: none;
}

.qr-box {
  display: flex;
  justify-content: center;
}

.qr-box img {
  width: 280px;
  height: 280px;
  object-fit: contain;
}
</style>
