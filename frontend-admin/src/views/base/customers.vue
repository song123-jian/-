<template>
  <MasterCrudPage :title="config.title" :metrics="metrics">
    <template #toolbar>
      <el-button v-for="action in config.toolbarActions" :key="action.key" :type="action.type || 'default'" :plain="action.plain" @click="handleToolbarAction(action.key)">
        <el-icon v-if="action.icon">
          <component :is="action.icon" />
        </el-icon>
        {{ action.label }}
      </el-button>
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
import BaseCrudDetail from '@/components/BaseCrudDetail.vue'
import BaseCrudForm from '@/components/BaseCrudForm.vue'
import BaseCrudTable from '@/components/BaseCrudTable.vue'
import MasterCrudPage from '@/components/MasterCrudPage.vue'
import SearchBar from '@/components/SearchBar.vue'
import { useBaseCrudPage } from '@/composables/useBaseCrudPage'
import { createCustomer, deleteCustomer, getCustomerList, updateCustomer } from '@/api/customer'
import { customerPageConfig as config } from '@/views/base/base-data-schema'

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

function handleRowAction(key: string, row: any) {
  if (key === 'inspect') return (selectedCustomer.value = row)
  if (key === 'edit') return handleEdit(row)
  if (key === 'delete') return handleDelete(row)
}

async function handleToolbarAction(key: string) {
  if (key === 'add') return handleAdd()
  if (key === 'refresh') return fetchData()
}

fetchData()
</script>
