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
            <el-select v-if="field.type === 'select'" v-model="searchState[field.prop as keyof typeof searchState]" :placeholder="field.placeholder || '全部'" clearable :filterable="field.filterable" :style="{ width: field.width || '140px' }">
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
      <BaseCrudDetail :title="config.detailTitle" :empty-text="config.emptyDetailText" :row="selectedUser" :items="config.detailItems" />
    </template>

    <BaseCrudForm v-model="dialogVisible" :title="dialogTitle" :config="config" :model="form" :is-editing="!!form.id" @submit="handleSubmit" />

    <el-dialog v-model="resetVisible" title="重置密码" width="420px">
      <el-form :model="resetForm" label-width="96px">
        <el-form-item label="新密码">
          <el-input v-model="resetForm.newPassword" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmResetPwd">确定</el-button>
      </template>
    </el-dialog>
  </MasterCrudPage>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import BaseCrudDetail from '@/components/BaseCrudDetail.vue'
import BaseCrudForm from '@/components/BaseCrudForm.vue'
import BaseCrudTable from '@/components/BaseCrudTable.vue'
import MasterCrudPage from '@/components/MasterCrudPage.vue'
import SearchBar from '@/components/SearchBar.vue'
import { useBaseCrudPage } from '@/composables/useBaseCrudPage'
import { createUser, deleteUser, getUserList, resetPassword, updateUser } from '@/api/user'
import { userPageConfig as config } from '@/views/base/base-data-schema'
import { ElMessage } from 'element-plus'

const resetVisible = ref(false)
const resetTarget = ref<any>(null)
const resetForm = reactive({ newPassword: '123456' })

const {
  loading,
  tableData,
  selectedRow: selectedUser,
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
    list: getUserList,
    create: createUser,
    update: updateUser,
    remove: deleteUser,
  },
  titles: {
    add: '新增用户',
    edit: '编辑用户',
  },
  messages: {
    createSuccess: '创建成功',
    updateSuccess: '更新成功',
    deleteSuccess: '删除成功',
  },
  deleteConfirmText: (row) => `确认删除用户 ${row.username}？`,
})

function handleResetPwd(row: any) {
  resetTarget.value = row
  resetForm.newPassword = '123456'
  resetVisible.value = true
}

async function confirmResetPwd() {
  if (!resetTarget.value) return
  try {
    await resetPassword(resetTarget.value.id, { newPassword: resetForm.newPassword })
    ElMessage.success('密码已重置')
    resetVisible.value = false
    resetTarget.value = null
  } catch {}
}

function handleRowAction(key: string, row: any) {
  if (key === 'inspect') return (selectedUser.value = row)
  if (key === 'edit') return handleEdit(row)
  if (key === 'reset') return handleResetPwd(row)
  if (key === 'delete') return handleDelete(row)
}

async function handleToolbarAction(key: string) {
  if (key === 'add') return handleAdd()
  if (key === 'refresh') return fetchData()
}

fetchData()
</script>
