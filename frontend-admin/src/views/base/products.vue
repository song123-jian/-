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
        <el-icon v-if="action.icon">
          <component :is="action.icon" />
        </el-icon>
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
      <BaseCrudDetail :title="config.detailTitle" :empty-text="config.emptyDetailText" :row="selectedProduct" :items="config.detailItems" />
    </template>

    <BaseCrudForm
      v-model="dialogVisible"
      :title="dialogTitle"
      :config="config"
      :model="form"
      :is-editing="!!form.id"
      @submit="handleSubmit"
    />
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
import { createProduct, deleteProduct, getProductList, updateProduct } from '@/api/product'
import { productPageConfig as config } from '@/views/base/base-data-schema'
import { useBaseCrudPage } from '@/composables/useBaseCrudPage'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)

const {
  loading,
  tableData,
  selectedRow: selectedProduct,
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
    list: getProductList,
    create: createProduct,
    update: updateProduct,
    remove: deleteProduct,
  },
  titles: {
    add: '新增产品',
    edit: '编辑产品',
  },
  messages: {
    createSuccess: '创建成功',
    updateSuccess: '更新成功',
    deleteSuccess: '删除成功',
  },
  deleteConfirmText: (row) => `确认删除产品 ${row.name}？`,
})

async function handleBatchStatus(status: string) {
  if (selectedRows.value.length === 0) return
  const label = status === '1' ? '启用' : '禁用'
  try {
    for (const row of selectedRows.value) {
      await updateProduct(row.id, { status })
    }
    ElMessage.success(`批量${label}成功`)
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
    await importData('product', file)
    ElMessage.success('导入成功')
    fetchData()
  } catch {}
}

async function handleExport() {
  try {
    await exportData('product', `产品导出_${Date.now()}.xlsx`)
  } catch {}
}

function goLogs() {
  router.push({ path: '/system/logs', query: { keyword: config.logKeyword } })
}

function handleInspect(row: any) {
  selectedProduct.value = row
}

function handleRowAction(key: string, row: any) {
  if (key === 'inspect') return handleInspect(row)
  if (key === 'edit') return handleEdit(row)
  if (key === 'delete') return handleDelete(row)
}

async function handleToolbarAction(key: string) {
  if (key === 'add') return handleAdd()
  if (key === 'refresh') return fetchData()
  if (key === 'batch-enable') return handleBatchStatus('1')
  if (key === 'batch-disable') return handleBatchStatus('0')
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
</style>
