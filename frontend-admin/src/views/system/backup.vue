<template>
  <div class="page-container">
    <PageHeader title="数据备份">
      <el-button type="primary" @click="handleCreateBackup">
        <el-icon><Plus /></el-icon>立即备份
      </el-button>
    </PageHeader>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="fileName" label="备份文件" width="250" />
        <el-table-column prop="fileSize" label="文件大小" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'running' ? 'warning' : 'danger'">
              {{ row.status === 'completed' ? '完成' : row.status === 'running' ? '进行中' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="备份时间" width="180" />
        <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" width="120">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleRestore(row)" v-if="row.status === 'completed'">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize"
        :total="pagination.total" :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper" class="pagination"
        @size-change="fetchData" @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { getBackupList, createBackup, restoreBackup } from '@/api/system'

const loading = ref(false)
const tableData = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getBackupList({ page: pagination.page, pageSize: pagination.pageSize })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

async function handleCreateBackup() {
  try {
    await createBackup()
    ElMessage.success('备份任务已创建')
    fetchData()
  } catch { /* */ }
}

async function handleRestore(row: any) {
  await ElMessageBox.confirm('确定恢复该备份数据？此操作将覆盖当前数据！', '警告', { type: 'warning' })
  try {
    await restoreBackup(row.id)
    ElMessage.success('恢复成功')
  } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
