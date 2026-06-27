<template>
  <div class="page-container">
    <PageHeader title="预警中心">
      <el-button type="primary" plain @click="goNotifications">
        <el-icon><Bell /></el-icon>消息中心
      </el-button>
      <el-button type="success" plain @click="fetchData">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </PageHeader>

    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="item in statCards" :key="item.title">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-card-content">
            <div>
              <div class="stat-title">{{ item.title }}</div>
              <div class="stat-value">{{ item.value }}</div>
            </div>
            <el-icon :size="34" :style="{ color: item.color }">
              <component :is="item.icon" />
            </el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="分类">
        <el-select v-model="searchCategory" placeholder="全部" clearable style="width: 140px">
          <el-option label="库存" value="库存" />
          <el-option label="模具" value="模具" />
        </el-select>
      </el-form-item>
      <el-form-item label="等级">
        <el-select v-model="searchLevel" placeholder="全部" clearable style="width: 140px">
          <el-option label="警告" value="WARNING" />
          <el-option label="严重" value="ERROR" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="filteredWarnings" stripe v-loading="loading" @row-click="handleRowClick">
        <el-table-column prop="category" label="分类" width="100">
          <template #default="{ row }">
            <el-tag :type="row.category === '模具' ? 'warning' : 'success'">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="row.level === 'ERROR' ? 'danger' : 'warning'">
              {{ row.level === 'ERROR' ? '严重' : '警告' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="140" />
        <el-table-column prop="title" label="对象" width="150" />
        <el-table-column prop="targetName" label="名称" width="160" />
        <el-table-column prop="value" label="当前值" width="100" />
        <el-table-column prop="threshold" label="阈值" width="100" />
        <el-table-column prop="message" label="预警内容" min-width="320" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getWarningList, getWarningSummary } from '@/api/warning'

const router = useRouter()
const loading = ref(false)
const warnings = ref<any[]>([])
const summary = ref<any>({})
const searchKeyword = ref('')
const searchCategory = ref('')
const searchLevel = ref('')

const statCards = computed(() => [
  { title: '预警总数', value: summary.value.total ?? 0, icon: 'Bell', color: '#e6a23c' },
  { title: '库存预警', value: summary.value.stock ?? 0, icon: 'Coin', color: '#67c23a' },
  { title: '模具预警', value: summary.value.mold ?? 0, icon: 'Box', color: '#f56c6c' },
  { title: '严重预警', value: summary.value.error ?? 0, icon: 'WarningFilled', color: '#d9534f' },
])

const filteredWarnings = computed(() => {
  return warnings.value.filter((item) => {
    const keywordHit = !searchKeyword.value
      || String(item.type || '').includes(searchKeyword.value)
      || String(item.title || '').includes(searchKeyword.value)
      || String(item.targetName || '').includes(searchKeyword.value)
      || String(item.message || '').includes(searchKeyword.value)
    const categoryHit = !searchCategory.value || item.category === searchCategory.value
    const levelHit = !searchLevel.value || item.level === searchLevel.value
    return keywordHit && categoryHit && levelHit
  })
})

function handleRowClick() {
  router.push('/system/notifications')
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
}

function handleReset() {
  searchKeyword.value = ''
  searchCategory.value = ''
  searchLevel.value = ''
}

function goNotifications() {
  router.push('/system/notifications')
}

async function fetchData() {
  loading.value = true
  try {
    const [listRes, summaryRes]: any = await Promise.all([getWarningList(), getWarningSummary()])
    warnings.value = listRes.data || []
    summary.value = summaryRes.data || {}
  } catch {
    warnings.value = []
    summary.value = {}
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.stat-row {
  margin-bottom: 16px;
}

.stat-card {
  .stat-card-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-title {
    font-size: 14px;
    color: #909399;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 26px;
    font-weight: 700;
    color: #303133;
  }
}
</style>
