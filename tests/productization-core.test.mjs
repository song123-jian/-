import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAuditFieldDiffs,
  buildAuditTrailEntry,
  summarizeAuditEntries,
} from '../frontend-admin/src/utils/audit-trail.ts'
import {
  buildMrpRequirementRows,
  summarizeMrpRequirements,
} from '../frontend-admin/src/utils/bom-mrp.ts'
import {
  buildProductCostResult,
  calcExpenseLineCost,
  calcLaborLineCost,
  calcMaterialLineCost,
  summarizeProductCosts,
} from '../frontend-admin/src/utils/cost-accounting.ts'
import {
  buildImportTemplateCsv,
  findImportTemplate,
  listImportTemplates,
  summarizeImportTemplates,
} from '../frontend-admin/src/utils/import-template-center.ts'
import { buildProductionScheduleBoard } from '../frontend-admin/src/utils/production-schedule.ts'
import {
  buildWarningWorkflowItems,
  createWarningWorkflowState,
  getWarningWorkflowStatusText,
  summarizeWarningWorkflow,
} from '../frontend-admin/src/utils/warning-workflow.ts'

describe('BOM/MRP 基础版', () => {
  it('按 BOM 用量、损耗、库存、在途和安全库存生成缺料提示', () => {
    const rows = buildMrpRequirementRows({
      bomRows: [
        { parentProductId: 10, materialId: 100, materialCode: 'M-ABS', materialName: 'ABS', unit: 'kg', qtyPerParent: 2, lossRate: '10%' },
        { parentProductId: 10, materialId: 101, materialCode: 'M-COLOR', materialName: '色粉', unit: 'kg', qtyPerParent: 0.1 },
      ],
      demandRows: [
        { orderNo: 'MO-001', productId: 10, productName: '外壳', planQty: 10, dueDate: '2026-07-10', status: 'RUNNING' },
        { orderNo: 'MO-CLOSED', productId: 10, productName: '外壳', planQty: 999, status: 'CLOSED' },
      ],
      stockRows: [
        { materialId: 100, availableQty: 15, incomingQty: 0, safetyStock: 2 },
        { materialId: 101, availableQty: 5, incomingQty: 0, safetyStock: 0 },
      ],
    })

    assert.equal(rows[0].materialCode, 'M-ABS')
    assert.equal(rows[0].grossQty, 20)
    assert.equal(rows[0].lossQty, 2)
    assert.equal(rows[0].requiredQty, 22)
    assert.equal(rows[0].shortageQty, 9)
    assert.equal(rows[0].coverageRate, 59.1)
    assert.equal(rows[0].riskLevel, 'danger')
    assert.deepEqual(rows[0].sourceOrders.map((item) => item.orderNo), ['MO-001'])

    const summary = summarizeMrpRequirements(rows)
    assert.equal(summary.materialCount, 2)
    assert.equal(summary.shortageCount, 1)
    assert.equal(summary.totalRequiredQty, 23)
    assert.equal(summary.totalShortageQty, 9)
  })
})

describe('生产排程看板', () => {
  it('识别机台冲突、模具冲突、交期风险和无效时间', () => {
    const board = buildProductionScheduleBoard([
      { orderNo: 'MO-001', productName: '外壳', machineId: 'A01', machineName: 'A01', moldId: 'M1', moldCode: 'M1', startTime: '2026-07-04 08:00', endTime: '2026-07-04 12:00', dueTime: '2026-07-04 12:30' },
      { orderNo: 'MO-002', productName: '盖板', machineId: 'A01', machineName: 'A01', moldId: 'M2', moldCode: 'M2', startTime: '2026-07-04 10:00', endTime: '2026-07-04 14:00', dueTime: '2026-07-04 15:00' },
      { orderNo: 'MO-003', productName: '底座', machineId: 'A02', machineName: 'A02', moldId: 'M1', moldCode: 'M1', startTime: '2026-07-04 11:00', endTime: '2026-07-04 13:00', dueTime: '2026-07-04 12:00' },
      { orderNo: 'MO-004', productName: '支架', machineId: 'A03', machineName: 'A03', moldId: 'M3', moldCode: 'M3', startTime: '2026-07-04 16:00', endTime: '2026-07-04 15:00' },
    ])

    assert.equal(board.summary.jobCount, 4)
    assert.equal(board.summary.machineCount, 3)
    assert.equal(board.summary.conflictCount, 4)
    assert.equal(board.summary.overdueCount, 1)
    assert.equal(board.summary.invalidCount, 1)
    assert.equal(board.conflicts.some((item) => item.type === 'MACHINE_OVERLAP'), true)
    assert.equal(board.conflicts.some((item) => item.type === 'MOLD_OVERLAP'), true)
    assert.equal(board.conflicts.some((item) => item.type === 'DUE_DATE_RISK'), true)
    assert.equal(board.conflicts.some((item) => item.type === 'INVALID_TIME'), true)
  })
})

describe('成本核算基础版', () => {
  it('汇总原料、人工和制造费用并识别成本风险', () => {
    assert.equal(calcMaterialLineCost({ qty: 10, unitPrice: 5, lossRate: '10%' }), 55)
    assert.equal(calcLaborLineCost({ hours: 2, hourlyRate: 20, qty: 100, pieceRate: 0.1 }), 50)
    assert.equal(calcExpenseLineCost({ amount: 100, allocationRate: '50%' }), 50)

    const result = buildProductCostResult({
      productCode: 'P-001',
      productName: '外壳',
      outputQty: 100,
      referenceUnitPrice: 1.7,
      materials: [{ qty: 10, unitPrice: 5, lossRate: '10%' }],
      labors: [{ hours: 2, hourlyRate: 20, qty: 100, pieceRate: 0.1 }],
      expenses: [{ amount: 100, allocationRate: '50%' }],
    })

    assert.equal(result.totalCost, 155)
    assert.equal(result.unitCost, 1.55)
    assert.equal(result.grossMarginRate, 8.8)
    assert.equal(result.riskLevel, 'warning')
    assert.deepEqual(summarizeProductCosts([result]), {
      productCount: 1,
      totalCost: 155,
      materialCost: 55,
      laborCost: 50,
      expenseCost: 50,
      warningCount: 1,
      dangerCount: 0,
    })
  })
})

describe('操作审计增强', () => {
  it('记录关键字段变更前后值并脱敏敏感字段', () => {
    const diffs = buildAuditFieldDiffs(
      { name: '外壳', safe_stock: 100, api_key: 'old' },
      { name: '外壳A', safe_stock: 200, api_key: 'new' },
      { name: '产品名称', safe_stock: '安全库存', api_key: '接口密钥' },
    )

    assert.deepEqual(diffs.map((item) => [item.label, item.before, item.after, item.level]), [
      ['接口密钥', '***', '***', 'warning'],
      ['产品名称', '外壳', '外壳A', 'normal'],
      ['安全库存', '100', '200', 'warning'],
    ])

    const entry = buildAuditTrailEntry({ module: '产品', action: '修改', targetType: 'product', targetId: 1, before: { price: 1 }, after: { price: 2 } })
    assert.equal(entry.target, 'product#1')
    assert.equal(entry.riskLevel, 'warning')
    assert.deepEqual(summarizeAuditEntries([entry]), { entryCount: 1, diffCount: 1, warningCount: 1, dangerCount: 0 })
  })
})

describe('导入导出模板中心', () => {
  it('提供主数据、期初库存、价格、订单和生产模板', () => {
    const templates = listImportTemplates('生产')
    assert.equal(templates.some((item) => item.code === 'bom-basic'), true)
    assert.equal(findImportTemplate('sale-order')?.category, '订单')

    const csv = buildImportTemplateCsv('piece-price')
    assert.equal(csv.split('\n')[0].includes('"product_code"'), true)
    assert.equal(csv.includes('"计件单价"'), true)

    const summary = summarizeImportTemplates()
    assert.equal(summary.total >= 6, true)
    assert.equal(summary.categories['主数据'] >= 1, true)
    assert.equal(summary.requiredColumnCount > summary.total, true)
  })
})

describe('异常预警闭环', () => {
  it('为预警生成分派、处理、关闭状态和统计', () => {
    const warnings = [
      { id: 'w1', category: '库存', level: 'ERROR', type: '安全库存不足', title: 'P1', targetName: '外壳', value: 0, threshold: 10, message: '缺料', targetType: 'product' },
      { id: 'w2', category: '模具', level: 'WARNING', type: '保养临近', title: 'M1', targetName: '一号模', value: 80, threshold: 70, message: '保养', targetType: 'mold' },
    ]
    const states = [
      createWarningWorkflowState('w1', 'processing', '班长', '', '2026-07-04T10:00:00.000Z'),
      createWarningWorkflowState('w2', 'closed', '设备', '已保养', '2026-07-04T11:00:00.000Z'),
    ]
    const rows = buildWarningWorkflowItems(warnings, states)

    assert.equal(rows[0].workflowStatus, 'processing')
    assert.equal(rows[0].nextAction, '关闭')
    assert.equal(rows[1].closeReason, '已保养')
    assert.equal(getWarningWorkflowStatusText('assigned'), '已分派')
    assert.deepEqual(summarizeWarningWorkflow(rows), {
      total: 2,
      open: 0,
      assigned: 0,
      processing: 1,
      closed: 1,
      unclosedError: 1,
    })
  })
})
