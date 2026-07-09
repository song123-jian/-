<template>
  <MasterCrudPage :title="config.title" :subtitle="config.subtitle" :metrics="metrics">
    <template #toolbar>
      <el-button v-for="action in config.toolbarActions" :key="action.key" :type="action.type || 'default'" :plain="action.plain" :loading="action.key === 'export' && exporting" @click="handleToolbarAction(action.key)">
        <el-icon v-if="action.icon">
          <component :is="action.icon" />
        </el-icon>
        {{ action.label }}
      </el-button>
    </template>

    <template #search>
      <SearchBar
        :keyword="searchKeyword"
        title="筛选客户"
        description="按客户关键字、状态和信用等级快速定位往来单位。"
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
            <el-input v-else v-model="searchState[field.prop as keyof typeof searchState]" :placeholder="field.placeholder || '请输入'" clearable :style="{ width: field.width || '180px' }" />
          </el-form-item>
        </template>
      </SearchBar>
    </template>

    <template #table>
      <BaseCrudTable :config="config" :rows="tableData" :loading="loading" :pagination="pagination" action-label="操作" @page-change="fetchData" @row-action="handleRowAction" />
    </template>

    <template #detail>
      <BaseCrudDetail :title="config.detailTitle" :empty-text="config.emptyDetailText" :row="selectedCustomer" :items="config.detailItems" />
    </template>

    <BaseCrudForm v-model="dialogVisible" :title="dialogTitle" :config="config" :model="form" :is-editing="!!form.id" @submit="handleSubmit" />
  </MasterCrudPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import BaseCrudDetail from '@/components/BaseCrudDetail.vue'
import BaseCrudForm from '@/components/BaseCrudForm.vue'
import BaseCrudTable from '@/components/BaseCrudTable.vue'
import MasterCrudPage from '@/components/MasterCrudPage.vue'
import SearchBar from '@/components/SearchBar.vue'
import { useBaseCrudPage } from '@/composables/useBaseCrudPage'
import { approveCustomer, createCustomer, deleteCustomer, getCustomerList, updateCustomer } from '@/api/customer'
import { customerPageConfig as config } from '@/views/base/base-data-schema'
import { recordBusinessAudit } from '@/utils/business-audit'
import { exportExcelFile, type ExcelColumn } from '@/utils/export-excel'
import { formatDateTime } from '@/utils'
import { getCustomerCreditLabel } from '@/utils/customer-master'

const {
  loading,
  tableData,
  selectedRow: selectedCustomer,
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
  openAdd: handleAdd,
  openEdit: handleEdit,
  submitForm: handleSubmit,
  deleteRow: handleDelete,
} = useBaseCrudPage({
  config,
  api: {
    list: getCustomerList,
    create: createCustomer,
    update: updateCustomer,
    remove: deleteCustomer,
  },
  titles: {
    add: '新增客户',
    edit: '编辑客户',
  },
  messages: {
    createSuccess: '创建成功',
    updateSuccess: '更新成功',
    deleteSuccess: '删除成功',
  },
  deleteConfirmText: (row) => `确认删除客户 ${row.name}？`,
})

const exporting = ref(false)

const customerExportColumns: ExcelColumn<any>[] = [
  { label: '客户编号', prop: 'code' },
  { label: '客户名称', prop: 'name' },
  { label: '简称', prop: 'shortName' },
  { label: '联系人', prop: 'contact' },
  { label: '电话', prop: 'phone' },
  { label: '信用等级', value: (row) => getCustomerCreditLabel(row.creditLevel) },
  { label: '账期', value: (row) => `${Number(row.paymentDays || 0)}天` },
  { label: '税号', prop: 'taxNo' },
  { label: '发票抬头', prop: 'invoiceTitle' },
  { label: '销售员ID', prop: 'salesUserId' },
  { label: '状态', value: (row) => statusText(row.status) },
  { label: '创建时间', value: (row) => formatDateTime(row.createdAt || row.updatedAt) },
]

function statusText(value: any) {
  const status = String(value ?? '')
  if (status === '1') return '启用'
  if (status === '0') return '禁用'
  return status || '-'
}

function handleRowAction(key: string, row: any) {
  if (key === 'inspect') return (selectedCustomer.value = row)
  if (key === 'edit') return handleEdit(row)
  if (key === 'approve') return handleApprove(row)
  if (key === 'delete') return handleDelete(row)
}

async function handleApprove(row: any) {
  await approveCustomer(row.id)
  ElMessage.success('审核成功')
  fetchData()
}

async function handleToolbarAction(key: string) {
  if (key === 'add') return handleAdd()
  if (key === 'refresh') return fetchData()
  if (key === 'export') return handleExport()
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const query = config.buildQuery({
      page: 1,
      pageSize: 10000,
      keyword: searchKeyword.value,
      search: {
        status: searchState.status,
        creditLevel: searchState.creditLevel,
      },
    })
    const res: any = await getCustomerList(query)
    const rows = res.data?.records || res.data?.list || []
    const filename = `客户管理导出_${Date.now()}.xls`
    exportExcelFile({
      filename,
      sheetName: '客户管理',
      columns: customerExportColumns,
      rows,
    })
    await recordBusinessAudit({
      module: '客户管理',
      action: 'EXPORT',
      targetType: 'customer',
      targetId: 'filtered',
      count: rows.length,
      scope: '当前筛选',
      filename,
      detail: {
        keyword: searchKeyword.value,
        status: searchState.status,
        creditLevel: searchState.creditLevel,
      },
    })
    ElMessage.success(`已导出 ${rows.length} 条客户`)
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

fetchData()
</script>
