<template>
  <div class="page-container">
    <PageHeader title="用户管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增用户
      </el-button>
    </PageHeader>

    <!-- 搜索栏 -->
    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="请选择" clearable>
          <el-option label="启用" value="1" />
          <el-option label="禁用" value="0" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <!-- 数据表格 -->
    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="realName" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="role" label="角色" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="warning" link @click="handleResetPwd(row)">重置密码</el-button>
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

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="姓名" prop="realName">
          <el-input v-model="form.realName" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="老板" value="boss" />
          </el-select>
        </el-form-item>
        <el-form-item label="密码" prop="password" v-if="!form.id">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
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
import { getUserList, createUser, updateUser, deleteUser, resetPassword } from '@/api/user'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchStatus = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增用户')
const formRef = ref<FormInstance>()

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

// 表单
const form = reactive({
  id: 0,
  username: '',
  realName: '',
  phone: '',
  role: '',
  password: '',
  status: 1,
})

// 表单验证规则
const formRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

// 获取数据
async function fetchData() {
  loading.value = true
  try {
    const res: any = await getUserList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: searchStatus.value,
    })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false
  }
}

// 搜索
function handleSearch(params: any) {
  pagination.page = 1
  fetchData()
}

// 重置
function handleReset() {
  searchStatus.value = ''
  pagination.page = 1
  fetchData()
}

// 新增
function handleAdd() {
  dialogTitle.value = '新增用户'
  Object.assign(form, { id: 0, username: '', realName: '', phone: '', role: '', password: '', status: 1 })
  dialogVisible.value = true
}

// 编辑
function handleEdit(row: any) {
  dialogTitle.value = '编辑用户'
  Object.assign(form, { ...row, password: '' })
  dialogVisible.value = true
}

// 提交表单
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) {
      await updateUser(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createUser(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 错误已在拦截器中处理
  }
}

// 重置密码
async function handleResetPwd(row: any) {
  await ElMessageBox.confirm('确定重置该用户密码？', '提示', { type: 'warning' })
  try {
    await resetPassword(row.id)
    ElMessage.success('密码已重置')
  } catch {
    // 错误已在拦截器中处理
  }
}

// 删除
async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该用户？', '提示', { type: 'warning' })
  try {
    await deleteUser(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 错误已在拦截器中处理
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
