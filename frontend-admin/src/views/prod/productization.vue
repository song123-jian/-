<template>
  <div class="page-container">
    <PageHeader title="产品化中心">
      <el-button type="primary" plain @click="refreshView">
        <el-icon><Refresh /></el-icon>
        刷新口径
      </el-button>
    </PageHeader>

    <div class="kpi-grid">
      <div v-for="item in kpiCards" :key="item.label" class="kpi-card" :class="`kpi-card--${item.tone}`">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.meta }}</small>
      </div>
    </div>

    <el-card shadow="hover">
      <el-tabs v-model="activeTab" class="work-tabs">
        <el-tab-pane label="BOM/MRP" name="mrp">
          <el-table :data="mrpRows" stripe empty-text="暂无MRP缺料数据">
            <el-table-column prop="materialCode" label="原料编码" min-width="130" />
            <el-table-column prop="materialName" label="原料名称" min-width="150" />
            <el-table-column label="需求数量" width="120" align="right">
              <template #default="{ row }">{{ qtyText(row.requiredQty, row.unit) }}</template>
            </el-table-column>
            <el-table-column label="可用库存" width="120" align="right">
              <template #default="{ row }">{{ qtyText(row.availableQty, row.unit) }}</template>
            </el-table-column>
            <el-table-column label="在途" width="100" align="right">
              <template #default="{ row }">{{ qtyText(row.incomingQty, row.unit) }}</template>
            </el-table-column>
            <el-table-column label="缺料" width="120" align="right">
              <template #default="{ row }">
                <el-tag :type="row.shortageQty > 0 ? 'danger' : 'success'" effect="plain">
                  {{ qtyText(row.shortageQty, row.unit) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="覆盖率" width="150">
              <template #default="{ row }">
                <el-progress :percentage="progressPercent(row.coverageRate)" :color="coverageColor(row.coverageRate)" />
              </template>
            </el-table-column>
            <el-table-column label="来源工单" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.sourceOrders.map((item: any) => item.orderNo).join('、') }}
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="生产排程" name="schedule">
          <div v-if="scheduleBoard.conflicts.length" class="risk-list">
            <el-alert
              v-for="item in scheduleBoard.conflicts"
              :key="`${item.type}-${item.orderNos.join('-')}`"
              :type="item.level === 'danger' ? 'error' : 'warning'"
              :title="item.title"
              :description="item.description"
              show-icon
              :closable="false"
            />
          </div>
          <el-table :data="scheduleBoard.rows" stripe empty-text="暂无排程数据">
            <el-table-column prop="orderNo" label="工单" min-width="120" />
            <el-table-column prop="productName" label="产品" min-width="130" />
            <el-table-column prop="machineName" label="机台" width="110" />
            <el-table-column prop="moldCode" label="模具" width="120" />
            <el-table-column prop="startTime" label="计划开始" width="150" />
            <el-table-column prop="endTime" label="计划结束" width="150" />
            <el-table-column prop="dueTime" label="交期" width="150" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="scheduleTagType(row)" effect="plain">
                  {{ row.invalidTime ? '时间无效' : row.conflictCount ? '有冲突' : row.overdue ? '交期风险' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="成本核算" name="cost">
          <div class="cost-grid">
            <div v-for="item in costRows" :key="item.productCode" class="cost-card" :class="`cost-card--${item.riskLevel}`">
              <div class="cost-card__title">{{ item.productName }}</div>
              <div class="cost-card__value">¥{{ moneyText(item.unitCost) }}</div>
              <div class="cost-card__meta">总成本 ¥{{ moneyText(item.totalCost) }} / 毛利率 {{ item.grossMarginRate.toFixed(1) }}%</div>
            </div>
          </div>
          <el-table :data="costRows" stripe>
            <el-table-column prop="productCode" label="产品编码" min-width="120" />
            <el-table-column prop="productName" label="产品名称" min-width="140" />
            <el-table-column label="原料" width="120" align="right">
              <template #default="{ row }">¥{{ moneyText(row.materialCost) }}</template>
            </el-table-column>
            <el-table-column label="人工" width="120" align="right">
              <template #default="{ row }">¥{{ moneyText(row.laborCost) }}</template>
            </el-table-column>
            <el-table-column label="费用" width="120" align="right">
              <template #default="{ row }">¥{{ moneyText(row.expenseCost) }}</template>
            </el-table-column>
            <el-table-column label="单位成本" width="120" align="right">
              <template #default="{ row }">¥{{ moneyText(row.unitCost) }}</template>
            </el-table-column>
            <el-table-column label="成本风险" width="110">
              <template #default="{ row }">
                <el-tag :type="costTagType(row.riskLevel)" effect="plain">{{ costRiskText(row.riskLevel) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="审计差异" name="audit">
          <el-table :data="auditEntries" row-key="target" stripe>
            <el-table-column type="expand">
              <template #default="{ row }">
                <el-table :data="row.diffs" size="small" border>
                  <el-table-column prop="label" label="字段" width="140" />
                  <el-table-column prop="before" label="变更前" min-width="180" show-overflow-tooltip />
                  <el-table-column prop="after" label="变更后" min-width="180" show-overflow-tooltip />
                </el-table>
              </template>
            </el-table-column>
            <el-table-column prop="module" label="模块" width="130" />
            <el-table-column prop="action" label="动作" width="100" />
            <el-table-column prop="target" label="对象" min-width="140" />
            <el-table-column prop="operator" label="操作人" width="110" />
            <el-table-column prop="diffCount" label="变更字段" width="100" />
            <el-table-column label="风险" width="100">
              <template #default="{ row }">
                <el-tag :type="auditTagType(row.riskLevel)" effect="plain">{{ auditRiskText(row.riskLevel) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="模板中心" name="templates">
          <el-table :data="templates" stripe>
            <el-table-column prop="name" label="模板名称" min-width="160" />
            <el-table-column prop="category" label="分类" width="110" />
            <el-table-column prop="description" label="适用范围" min-width="260" show-overflow-tooltip />
            <el-table-column label="必填字段" width="110" align="right">
              <template #default="{ row }">{{ row.columns.filter((item: any) => item.required).length }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="downloadTemplate(row.code)">下载模板</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { buildAuditTrailEntry, summarizeAuditEntries, type AuditDiffLevel } from '@/utils/audit-trail'
import { buildMrpRequirementRows, summarizeMrpRequirements } from '@/utils/bom-mrp'
import { buildProductCostResult, summarizeProductCosts, type CostRiskLevel } from '@/utils/cost-accounting'
import {
  IMPORT_TEMPLATE_DEFINITIONS,
  buildImportTemplateCsv,
  summarizeImportTemplates,
} from '@/utils/import-template-center'
import { buildProductionScheduleBoard } from '@/utils/production-schedule'

const activeTab = ref('mrp')
const refreshVersion = ref(0)

const bomRows = [
  { parentProductId: 101, productName: '透明外壳', materialId: 201, materialCode: 'M-ABS', materialName: 'ABS原料', unit: 'kg', qtyPerParent: 0.025, lossRate: 0.03 },
  { parentProductId: 101, productName: '透明外壳', materialId: 202, materialCode: 'M-COLOR', materialName: '色粉', unit: 'kg', qtyPerParent: 0.0012, lossRate: 0.02 },
  { parentProductId: 102, productName: '蓝色盖板', materialId: 201, materialCode: 'M-ABS', materialName: 'ABS原料', unit: 'kg', qtyPerParent: 0.018, lossRate: 0.03 },
]
const demandRows = [
  { orderId: 1, orderNo: 'MO-001', productId: 101, productName: '透明外壳', planQty: 5000, dueDate: '2026-07-10', status: 'RUNNING' },
  { orderId: 2, orderNo: 'MO-002', productId: 102, productName: '蓝色盖板', planQty: 3000, dueDate: '2026-07-12', status: 'SCHEDULED' },
]
const stockRows = [
  { materialId: 201, materialCode: 'M-ABS', availableQty: 120, incomingQty: 20, safetyStock: 15 },
  { materialId: 202, materialCode: 'M-COLOR', availableQty: 2, incomingQty: 0, safetyStock: 1 },
]
const scheduleJobs = [
  { id: 1, orderNo: 'MO-001', productName: '透明外壳', machineId: 'A-01', machineName: 'A-01', moldId: 'MD-01', moldCode: 'MD-01', startTime: '2026-07-04 08:00', endTime: '2026-07-04 16:00', dueTime: '2026-07-04 18:00' },
  { id: 2, orderNo: 'MO-002', productName: '蓝色盖板', machineId: 'A-01', machineName: 'A-01', moldId: 'MD-02', moldCode: 'MD-02', startTime: '2026-07-04 14:00', endTime: '2026-07-04 22:00', dueTime: '2026-07-05 18:00' },
  { id: 3, orderNo: 'MO-003', productName: '黑色底座', machineId: 'A-02', machineName: 'A-02', moldId: 'MD-01', moldCode: 'MD-01', startTime: '2026-07-04 10:00', endTime: '2026-07-04 13:00', dueTime: '2026-07-04 12:00' },
]
const costInputs = [
  {
    productCode: 'P-1001',
    productName: '透明外壳',
    outputQty: 5000,
    referenceUnitPrice: 1.8,
    materials: [{ materialName: 'ABS原料', qty: 125, unitPrice: 12.8, lossRate: 0.03 }],
    labors: [{ processName: '注塑', qty: 5000, pieceRate: 0.12 }],
    expenses: [{ expenseName: '制造费用', amount: 450, allocationRate: 1 }],
  },
  {
    productCode: 'P-1002',
    productName: '蓝色盖板',
    outputQty: 3000,
    referenceUnitPrice: 1.25,
    materials: [{ materialName: 'ABS原料', qty: 54, unitPrice: 12.8, lossRate: 0.03 }],
    labors: [{ processName: '注塑', qty: 3000, pieceRate: 0.1 }],
    expenses: [{ expenseName: '制造费用', amount: 300, allocationRate: 1 }],
  },
]
const auditEntries = [
  buildAuditTrailEntry({
    module: '产品资料',
    action: '修改',
    targetType: 'product',
    targetId: 101,
    operator: 'admin',
    changedAt: '2026-07-04 10:00',
    before: { name: '透明外壳', safe_stock: 100, api_key: 'old-secret' },
    after: { name: '透明外壳', safe_stock: 200, api_key: 'new-secret' },
    labels: { safe_stock: '安全库存', name: '产品名称', api_key: '接口密钥' },
  }),
]
const templates = IMPORT_TEMPLATE_DEFINITIONS

const mrpRows = computed(() => {
  refreshVersion.value
  return buildMrpRequirementRows({ bomRows, demandRows, stockRows })
})
const mrpSummary = computed(() => summarizeMrpRequirements(mrpRows.value))
const scheduleBoard = computed(() => {
  refreshVersion.value
  return buildProductionScheduleBoard(scheduleJobs)
})
const costRows = computed(() => costInputs.map((item) => buildProductCostResult(item)))
const costSummary = computed(() => summarizeProductCosts(costRows.value))
const auditSummary = computed(() => summarizeAuditEntries(auditEntries))
const templateSummary = computed(() => summarizeImportTemplates(templates))

const kpiCards = computed(() => [
  { label: '缺料项', value: mrpSummary.value.shortageCount, meta: `物料 ${mrpSummary.value.materialCount} 项`, tone: mrpSummary.value.shortageCount ? 'danger' : 'success' },
  { label: '排程冲突', value: scheduleBoard.value.summary.conflictCount, meta: `工单 ${scheduleBoard.value.summary.jobCount} 张`, tone: scheduleBoard.value.summary.conflictCount ? 'danger' : 'success' },
  { label: '成本预警', value: costSummary.value.warningCount + costSummary.value.dangerCount, meta: `核算 ${costSummary.value.productCount} 个产品`, tone: costSummary.value.dangerCount ? 'danger' : costSummary.value.warningCount ? 'warning' : 'success' },
  { label: '审计字段', value: auditSummary.value.diffCount, meta: `记录 ${auditSummary.value.entryCount} 条`, tone: auditSummary.value.warningCount ? 'warning' : 'success' },
  { label: '导入模板', value: templateSummary.value.total, meta: `必填字段 ${templateSummary.value.requiredColumnCount} 个`, tone: 'primary' },
])

function refreshView() {
  refreshVersion.value += 1
  ElMessage.success('产品化口径已刷新')
}

function qtyText(value: number, unit = '') {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit || ''}`
}

function moneyText(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function progressPercent(value: number) {
  return Math.min(Math.max(Number(value || 0), 0), 100)
}

function coverageColor(value: number) {
  if (value < 80) return '#f56c6c'
  if (value < 100) return '#e6a23c'
  return '#67c23a'
}

function scheduleTagType(row: any) {
  if (row.invalidTime || row.conflictCount) return 'danger'
  if (row.overdue) return 'warning'
  return 'success'
}

function costTagType(value: CostRiskLevel) {
  if (value === 'danger') return 'danger'
  if (value === 'warning') return 'warning'
  return 'success'
}

function costRiskText(value: CostRiskLevel) {
  if (value === 'danger') return '倒挂'
  if (value === 'warning') return '偏高'
  return '正常'
}

function auditTagType(value: AuditDiffLevel) {
  if (value === 'danger') return 'danger'
  if (value === 'warning') return 'warning'
  return 'info'
}

function auditRiskText(value: AuditDiffLevel) {
  if (value === 'danger') return '高'
  if (value === 'warning') return '中'
  return '低'
}

function downloadTemplate(code: string) {
  const csv = buildImportTemplateCsv(code)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${code}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
</script>

<style scoped lang="scss">
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card,
.cost-card {
  min-width: 0;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #909399;
  border-radius: 6px;
  background: #fff;
}

.kpi-card {
  display: grid;
  gap: 6px;
  padding: 14px;

  span,
  small {
    color: #606266;
    line-height: 1.3;
  }

  strong {
    color: #303133;
    font-size: 24px;
    line-height: 1.2;
  }
}

.kpi-card--primary,
.cost-card--primary {
  border-left-color: #409eff;
}

.kpi-card--success,
.cost-card--normal {
  border-left-color: #67c23a;
}

.kpi-card--warning,
.cost-card--warning {
  border-left-color: #e6a23c;
}

.kpi-card--danger,
.cost-card--danger {
  border-left-color: #f56c6c;
}

.work-tabs :deep(.el-tabs__content) {
  padding-top: 8px;
}

.risk-list {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.cost-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.cost-card {
  padding: 14px;
}

.cost-card__title {
  color: #606266;
  line-height: 1.3;
}

.cost-card__value {
  margin-top: 8px;
  color: #303133;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.cost-card__meta {
  margin-top: 8px;
  color: #606266;
  font-size: 12px;
  line-height: 1.4;
}
</style>
