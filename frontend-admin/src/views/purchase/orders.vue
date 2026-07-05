<template>
  <div class="page-container purchase-orders-page" v-loading="loading">
    <PageHeader title="采购订单">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="goTo('/injection/purchase-requisition')">
        <el-icon><DocumentChecked /></el-icon>
        请购单
      </el-button>
      <el-button type="success" plain @click="goTo('/stock/in-purchase')">
        <el-icon><Bottom /></el-icon>
        采购入库
      </el-button>
    </PageHeader>

    <section class="kpi-grid">
      <article class="kpi-card">
        <span>采购订单</span>
        <strong>{{ summary.total }}</strong>
        <small>由请购单转采购跟踪</small>
      </article>
      <article class="kpi-card kpi-card--warning">
        <span>待下单</span>
        <strong>{{ summary.pending }}</strong>
        <small>已审核但未转采购</small>
      </article>
      <article class="kpi-card kpi-card--success">
        <span>已到货</span>
        <strong>{{ summary.arrived }}</strong>
        <small>已匹配采购入库记录</small>
      </article>
      <article class="kpi-card kpi-card--danger">
        <span>缺少供应商</span>
        <strong>{{ summary.noSupplier }}</strong>
        <small>需要采购确认供应商</small>
      </article>
    </section>

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <strong>订单跟踪</strong>
          <el-input v-model.trim="keyword" clearable placeholder="搜索请购单、物料、供应商" class="search-input" />
        </div>
      </template>

      <el-table :data="filteredRows" stripe empty-text="暂无采购订单">
        <el-table-column prop="orderNo" label="采购单号" min-width="150" show-overflow-tooltip />
        <el-table-column prop="sourceNo" label="来源请购" min-width="150" show-overflow-tooltip />
        <el-table-column prop="materialId" label="物料ID" width="100" />
        <el-table-column prop="requestedQty" label="采购数量" width="110" />
        <el-table-column prop="supplierId" label="供应商ID" width="110">
          <template #default="{ row }">{{ row.supplierId || '-' }}</template>
        </el-table-column>
        <el-table-column prop="expectedDate" label="期望到货" width="120">
          <template #default="{ row }">{{ row.expectedDate || '-' }}</template>
        </el-table-column>
        <el-table-column prop="statusText" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">{{ row.statusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goTo('/injection/purchase-requisition')">看请购</el-button>
            <el-button type="success" link @click="goTo('/stock/in-purchase')">入库</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bottom, DocumentChecked, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { getInjectionList } from '@/api/injection'
import { getStockLedger } from '@/api/stock'

type PurchaseOrderRow = {
  orderNo: string
  sourceNo: string
  materialId: number | string
  requestedQty: number
  supplierId?: number | string
  expectedDate?: string
  status: string
  statusText: string
  remark?: string
}

const router = useRouter()
const loading = ref(false)
const keyword = ref('')
const rows = ref<PurchaseOrderRow[]>([])

const filteredRows = computed(() => {
  const text = keyword.value.toLowerCase()
  if (!text) return rows.value
  return rows.value.filter((row) => JSON.stringify(row).toLowerCase().includes(text))
})

const summary = computed(() => ({
  total: rows.value.length,
  pending: rows.value.filter((row) => row.status === 'APPROVED').length,
  arrived: rows.value.filter((row) => row.status === 'ARRIVED').length,
  noSupplier: rows.value.filter((row) => !row.supplierId).length,
}))

function statusText(status: string) {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    SUBMITTED: '已提交',
    APPROVED: '待下单',
    CONVERTED: '已转采购',
    ARRIVED: '已到货',
    CLOSED: '已关闭',
  }
  return map[status] || status || '-'
}

function statusTag(status: string) {
  if (status === 'ARRIVED' || status === 'CLOSED') return 'success'
  if (status === 'APPROVED' || status === 'CONVERTED') return 'warning'
  return 'info'
}

function buildOrderNo(row: any) {
  return String(row.requisitionNo || row.requisition_no || row.id || '').replace(/^PR/, 'PO') || `PO-${row.id}`
}

async function fetchData() {
  loading.value = true
  try {
    const [requisitionRes, inboundRes] = await Promise.allSettled([
      getInjectionList('purchase-requisitions', { page: 1, pageSize: 200 }),
      getStockLedger({ page: 1, pageSize: 200, moveType: 'IN', moveReason: 'IN_PURCHASE' }),
    ])
    const requisitions = requisitionRes.status === 'fulfilled'
      ? requisitionRes.value.data?.records || requisitionRes.value.data || []
      : []
    const inboundRows = inboundRes.status === 'fulfilled'
      ? inboundRes.value.data?.records || inboundRes.value.data || []
      : []
    rows.value = requisitions.map((item: any) => {
      const hasInbound = inboundRows.some((row: any) => Number(row.productId || row.materialId) === Number(item.materialId))
      const status = hasInbound ? 'ARRIVED' : String(item.status || 'DRAFT').toUpperCase()
      return {
        orderNo: buildOrderNo(item),
        sourceNo: item.requisitionNo || item.requisition_no || `PR-${item.id}`,
        materialId: item.materialId || item.material_id || '-',
        requestedQty: Number(item.requestedQty || item.requested_qty || 0),
        supplierId: item.supplierId || item.supplier_id,
        expectedDate: item.expectedDate || item.expected_date,
        status,
        statusText: statusText(status),
        remark: item.remark || item.sourceMrpNo || item.source_mrp_no || '',
      }
    })
  } finally {
    loading.value = false
  }
}

function goTo(path: string) {
  router.push(path)
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.kpi-card {
  display: grid;
  gap: 6px;
  min-height: 92px;
  padding: 14px;
  border: 1px solid #dfe5ec;
  border-left: 4px solid #409eff;
  border-radius: 8px;
  background: #fff;
}

.kpi-card--warning { border-left-color: #e6a23c; }
.kpi-card--success { border-left-color: #67c23a; }
.kpi-card--danger { border-left-color: #f56c6c; }

.kpi-card span,
.kpi-card small {
  color: #64748b;
}

.kpi-card strong {
  color: #1f2933;
  font-size: 26px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.search-input {
  width: 260px;
}
</style>
