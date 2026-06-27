<template>
  <div class="page-container">
    <PageHeader title="数据备份">
      <el-button type="primary" @click="handleCreateBackup">
        <el-icon><Plus /></el-icon>
        立即备份
      </el-button>
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </PageHeader>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column type="index" label="#" width="70" />
        <el-table-column prop="fileName" label="备份文件" min-width="280" show-overflow-tooltip />
        <el-table-column prop="fileSize" label="文件大小" width="140">
          <template #default="{ row }">
            {{ formatFileSize(row.fileSize) }}
          </template>
        </el-table-column>
        <el-table-column prop="modifiedTime" label="修改时间" width="200" />
        <el-table-column label="操作" fixed="right" width="120">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleRestore(row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { createBackup, getBackupList, restoreBackup } from '@/api/system'

const loading = ref(false)
const tableData = ref<any[]>([])

function formatFileSize(size?: number | string) {
  const value = Number(size || 0)
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let current = value
  let index = 0
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024
    index += 1
  }
  return `${current.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getBackupList()
    tableData.value = res.data || []
  } catch {
    tableData.value = []
  } finally {
    loading.value = false
  }
}

async function handleCreateBackup() {
  try {
    await createBackup()
    ElMessage.success('备份任务已创建')
    await fetchData()
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleRestore(row: any) {
  await ElMessageBox.confirm('确定恢复该备份数据？此操作将覆盖当前数据！', '警告', { type: 'warning' })
  try {
    await restoreBackup(row.fileName)
    ElMessage.success('恢复成功')
    await fetchData()
  } catch {
    // 已由全局拦截器处理
  }
}

onMounted(() => {
  fetchData()
})
</script>
