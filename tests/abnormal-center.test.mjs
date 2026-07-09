import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { buildRoutePath, routeGroups } from '../frontend-admin/src/router/route-config.ts'
import {
  applyAbnormalCenterAction,
  buildAbnormalCenterItems,
  createAbnormalCenterState,
  summarizeAbnormalCenter,
} from '../frontend-admin/src/utils/abnormal-center.ts'
import {
  buildProductionReadiness,
  getProductionReadinessStatusText,
} from '../frontend-admin/src/utils/production-readiness.ts'

describe('生产齐套检查', () => {
  it('在产品、原料、机台、模具和现场门禁均满足时允许开工', () => {
    const result = buildProductionReadiness({
      today: '2026-07-08',
      order: {
        id: 1,
        orderNo: 'MO-READY',
        status: 'SCHEDULED',
        productId: 10,
        machineId: 20,
        moldId: 30,
        planQty: 100,
        pickedMaterialQty: 25,
        planEnd: '2026-07-10',
      },
      product: { id: 10, code: 'P-10', rawMaterialId: 99, rawMaterialUsage: 0.25, status: 1 },
      machine: { id: 20, code: 'A01', status: 'IDLE' },
      mold: { id: 30, code: 'M01', status: 'ACTIVE', lifetime: 100000, usedShots: 2000, maintenanceCycle: 5000, shotsSinceMaintenance: 100 },
      processCard: { id: 40, status: 'ACTIVE' },
      firstArticle: { id: 50, status: 'APPROVED_PRODUCTION' },
      startupCheck: { id: 60, status: 'PASSED' },
      materialMix: { id: 70, status: 'APPROVED' },
    })

    assert.equal(result.status, 'READY')
    assert.equal(result.canStart, true)
    assert.equal(result.score, 100)
    assert.equal(result.blockers.length, 0)
    assert.equal(getProductionReadinessStatusText(result.status), '可投产')
  })

  it('识别机台、模具、原料和计划时间风险并阻断开工', () => {
    const result = buildProductionReadiness({
      today: '2026-07-08',
      order: {
        id: 2,
        orderNo: 'MO-BLOCK',
        status: 'SCHEDULED',
        productId: 10,
        machineId: 20,
        moldId: 30,
        planQty: 100,
        pickedMaterialQty: 20,
        planEnd: '2026-07-05',
      },
      product: { id: 10, rawMaterialId: 99, rawMaterialUsage: 1, status: 1 },
      machine: { id: 20, status: 'MAINTENANCE' },
      mold: { id: 30, status: 'ACTIVE', maintenanceCycle: 1000, shotsSinceMaintenance: 1200 },
      stockRows: [{ productId: 99, qty: 10, lockedQty: 0 }],
      processCard: { id: 40, status: 'INACTIVE' },
      firstArticle: { id: 50, status: 'REJECTED' },
      startupCheck: { id: 60, status: 'FAILED' },
      materialMix: { id: 70, status: 'REJECTED' },
    })

    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.canStart, false)
    assert.equal(result.blockers.some((item) => item.includes('机台')), true)
    assert.equal(result.blockers.some((item) => item.includes('原料')), true)
    assert.equal(result.blockers.some((item) => item.includes('齐套')), true)
    assert.equal(result.warnings.some((item) => item.includes('计划')), true)
  })
})

describe('异常闭环中心', () => {
  it('聚合现场、预警、生产、质量和齐套异常并生成统计', () => {
    const rows = buildAbnormalCenterItems({
      now: '2026-07-08T09:00:00.000Z',
      andonEvents: [{ id: 1, eventNo: 'AE-001', title: 'A01 报警', level: 'CRITICAL', status: 'OPEN', createdAt: '2026-07-08 08:00:00' }],
      warnings: [{ id: 'stock-low', level: 'ERROR', category: '库存', targetName: 'ABS 原料', message: '低于安全库存' }],
      productionOrders: [{ id: 2, orderNo: 'MO-002', status: 'RUNNING', planEnd: '2026-07-07' }],
      qcRecords: [{ id: 3, checkResult: 'FAIL', defectType: '缩水', defectDesc: '首件不良' }],
      readinessChecks: [{ id: 4, checkNo: 'SC-004', status: 'FAILED', failedItemsText: '原料未齐套' }],
    })

    assert.equal(rows.length, 5)
    assert.equal(new Set(rows.map((item) => item.source)).size, 5)
    assert.equal(rows[0].status, 'OVERDUE')
    assert.equal(rows.every((item) => item.id && item.title && item.sourceText && item.statusText), true)

    const summary = summarizeAbnormalCenter(rows)
    assert.equal(summary.total, 5)
    assert.equal(summary.critical, 5)
    assert.equal(summary.overdue, 1)
    assert.equal(summary.sources.andon, 1)
    assert.equal(summary.sources.readiness, 1)
  })

  it('支持本地分派、处理、关闭记录并覆盖展示状态', () => {
    const [warning] = buildAbnormalCenterItems({
      warnings: [{ id: 'mold-life', level: 'WARNING', category: '模具', targetName: 'M01', message: '寿命临近' }],
    })

    let state = createAbnormalCenterState(warning, '2026-07-08T08:00:00.000Z')
    state = applyAbnormalCenterAction(state, { type: 'assign', actor: '张三', owner: '李四', at: '2026-07-08T08:10:00.000Z' })
    state = applyAbnormalCenterAction(state, { type: 'start', actor: '李四', at: '2026-07-08T08:20:00.000Z' })
    state = applyAbnormalCenterAction(state, { type: 'close', actor: '李四', note: '已安排保养', at: '2026-07-08T09:00:00.000Z' })

    const [closed] = buildAbnormalCenterItems({
      warnings: [{ id: 'mold-life', level: 'WARNING', category: '模具', targetName: 'M01', message: '寿命临近' }],
      states: [state],
    })

    assert.equal(closed.status, 'CLOSED')
    assert.equal(closed.owner, '李四')
    assert.deepEqual(closed.history.map((item) => item.action), ['assign', 'start', 'close'])
    assert.equal(summarizeAbnormalCenter([closed]).closed, 1)
  })
})

describe('异常闭环入口', () => {
  it('管理端和移动端均提供异常闭环入口', () => {
    const leafRoutes = routeGroups.flatMap((group) => group.children.map((item) => ({
      ...item,
      fullPath: buildRoutePath(group.path, item.path),
    })))
    const abnormalRoute = leafRoutes.find((item) => item.fullPath === '/workbench/abnormal-center')
    assert.equal(abnormalRoute?.title, '异常闭环中心')
    assert.equal(abnormalRoute?.view, 'workbench/abnormal-center.vue')
    assert.equal(existsSync('frontend-admin/src/views/workbench/abnormal-center.vue'), true)

    const mobileRouter = readFileSync('frontend-mobile/src/router/index.ts', 'utf8')
    const mobileHome = readFileSync('frontend-mobile/src/views/home/index.vue', 'utf8')
    const offline = readFileSync('frontend-mobile/src/utils/offline.ts', 'utf8')
    assert.equal(mobileRouter.includes('/m/abnormal-report'), true)
    assert.equal(mobileHome.includes("goTo('/m/abnormal-report')"), true)
    assert.equal(existsSync('frontend-mobile/src/views/abnormal-report/index.vue'), true)
    assert.equal(offline.includes("OfflineActionSource = 'qc' | 'inventory' | 'transfer' | 'andon'"), true)
  })
})
