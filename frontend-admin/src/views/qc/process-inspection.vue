<template>
  <div class="page-container process-inspection-page" v-loading="loading">
    <PageHeader title="过程巡检">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="goRecords">
        <el-icon><Plus /></el-icon>
        新增巡检
      </el-button>
    </PageHeader>

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <MetricStrip class="metric-section" :items="metricCards" testid="process-inspection-metrics" />

    <SearchBar :keyword="keyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="结果">
        <el-select v-model="result" clearable placeholder="全部" style="width: 150px">
          <el-option label="合格" value="PASS" />
          <el-option label="不合格" value="FAIL" />
          <el-option label="让步接收" value="CONDITIONAL" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="rows" stripe empty-text="暂无过程巡检">
        <el-table-column prop="orderNo" label="工单" min-width="140" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品" min-width="140" show-overflow-tooltip />
        <el-table-column prop="checkResult" label="结果" width="110">
          <template #default="{ row }">
            <el-tag :type="resultTag(row.checkResult)" effect="plain">{{ resultText(row.checkResult) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sampleQty" label="抽样数" width="100" />
        <el-table-column prop="defectQty" label="不良数" width="100" />
        <el-table-column prop="defectType" label="缺陷类型" min-width="130" show-overflow-tooltip />
        <el-table-column prop="defectDesc" label="缺陷描述" min-width="180" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="巡检时间" width="170">
          <template #default="{ row }">{{ row.createdAt || row.checkTime || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default>
            <el-button type="primary" link @click="goRecords">查看记录</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getQcRecordList } from '@/api/qcRecord'

const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const keyword = ref('')
const result = ref('')
const rows = ref<any[]>([])

const summary = computed(() => {
  const total = rows.value.length
  const failed = rows.value.filter((item) => item.checkResult === 'FAIL').length
  const conditional = rows.value.filter((item) => item.checkResult === 'CONDITIONAL').length
  const passed = rows.value.filter((item) => item.checkResult === 'PASS').length
  return {
    total,
    failed,
    conditional,
    passRate: total ? Number(((passed / total) * 100).toFixed(1)) : 0,
  }
})

const metricCards = computed(() => [
  { label: '巡检记录', value: summary.value.total, meta: 'IPQC 过程检验', tone: 'primary' as const },
  { label: '不合格', value: summary.value.failed, meta: '需进入不良品处置', tone: 'danger' as const },
  { label: '让步接收', value: summary.value.conditional, meta: '需复核确认', tone: 'warning' as const },
  { label: '合格率', value: summary.value.passRate, valueType: 'percent' as const, precision: 1, meta: '按当前筛选记录计算', tone: 'success' as const },
])

function resultText(value?: string) {
  if (value === 'PASS') return '合格'
  if (value === 'FAIL') return '不合格'
  if (value === 'CONDITIONAL') return '让步接收'
  return value || '-'
}

function resultTag(value?: string) {
  if (value === 'PASS') return 'success'
  if (value === 'FAIL') return 'danger'
  return 'warning'
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getQcRecordList({
      page: 1,
      pageSize: 100,
      keyword: keyword.value || undefined,
      checkType: 'IPQC',
      checkResult: result.value || undefined,
    })
    rows.value = res.data?.records || res.data || []
  } catch (error: any) {
    rows.value = []
    errorMessage.value = failureText(error, '过程巡检加载失败，请检查 Supabase 连接和 IPQC 质检记录。')
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  keyword.value = formData.keyword || ''
  fetchData()
}

function handleReset() {
  keyword.value = ''
  result.value = ''
  fetchData()
}

function goRecords() {
  router.push({ path: '/qc/records', query: { action: 'create', checkType: 'IPQC' } })
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.page-alert {
  margin-bottom: 12px;
}
</style>
