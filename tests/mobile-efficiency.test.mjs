import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMobileTodoItems,
  summarizeMobileTodos,
} from '../frontend-mobile/src/utils/mobile-todo.ts'
import {
  buildOfflineTaskCenter,
  getOfflineTaskSourceText,
  getOfflineTaskStatusText,
  normalizeOfflineActionTask,
  normalizeOfflineReportTask,
} from '../frontend-mobile/src/utils/offline-task-center.ts'
import {
  applyMobileReportTemplate,
  buildMobileReportTemplateOptions,
  findMobileReportTemplate,
} from '../frontend-mobile/src/utils/report-template.ts'
import {
  buildMobileScanRoute,
  getMobileScanTypeText,
  normalizeMobileScanPayload,
} from '../frontend-mobile/src/utils/scan-entry.ts'

describe('统一扫码入口', () => {
  it('解析机台、工单、产品、库位、批次和调拨码', () => {
    const machine = normalizeMobileScanPayload('M:A-01', 'machine')
    const product = normalizeMobileScanPayload('SKU|P-1001', 'product')
    const transfer = normalizeMobileScanPayload('TRANSFER:TR-001', 'transfer')

    assert.deepEqual(machine, { rawText: 'M:A-01', type: 'machine', value: 'A-01', valid: true, error: '' })
    assert.equal(product.value, 'P-1001')
    assert.equal(transfer.type, 'transfer')
    assert.equal(buildMobileScanRoute(machine), '/m/report')
    assert.equal(buildMobileScanRoute(product), '/m/stock')
    assert.equal(getMobileScanTypeText('batch'), '批次')
  })

  it('拦截空码和入口类型不匹配的扫码结果', () => {
    assert.equal(normalizeMobileScanPayload('', 'machine').valid, false)
    const mismatch = normalizeMobileScanPayload('P:P-1001', 'machine')
    assert.equal(mismatch.valid, false)
    assert.equal(mismatch.error, '条码类型与当前入口不匹配')
  })
})

describe('快捷报工模板', () => {
  it('按常用工序、班次和模次策略带出默认值', () => {
    const form = applyMobileReportTemplate({ quantity: '120', defectCount: '' }, 'injection-night')
    assert.equal(form.processName, '注塑')
    assert.equal(form.shift, 'NIGHT')
    assert.equal(form.defectCount, 0)
    assert.equal(form.moldCount, 120)

    const assembly = applyMobileReportTemplate({ quantity: '120', moldCount: '9' }, 'assembly-day')
    assert.equal(assembly.processName, '装配')
    assert.equal(assembly.moldCount, '')
    assert.equal(findMobileReportTemplate('missing').code, 'injection-day')
    assert.equal(buildMobileReportTemplateOptions().length >= 3, true)
  })
})

describe('移动端离线任务中心', () => {
  it('聚合报工、质检、盘点和调拨失败/待同步任务', () => {
    const report = {
      id: 1,
      workOrderId: 10,
      machineId: 2,
      processName: '注塑',
      shift: 'DAY',
      quantity: 100,
      defectCount: 3,
      moldCount: 100,
      sync_status: 'failed',
      created_at: '2026-07-04T10:00:00.000Z',
      retry_count: 2,
    }
    const qcTask = {
      id: 'qc-1',
      source: 'qc',
      title: '质检 MO-001',
      description: '外壳 / FAI',
      payload: { workOrderId: 10 },
      sync_status: 'pending',
      created_at: '2026-07-04T11:00:00.000Z',
      retry_count: 0,
      last_error: '网络异常',
    }
    const transferTask = {
      id: 'transfer-1',
      source: 'transfer',
      title: '调拨接收 TR-1',
      description: '一仓 -> 二仓',
      payload: { transferId: 1 },
      sync_status: 'syncing',
      created_at: '2026-07-04T12:00:00.000Z',
      retry_count: 0,
    }

    const reportTask = normalizeOfflineReportTask(report)
    const actionTask = normalizeOfflineActionTask(qcTask)
    const center = buildOfflineTaskCenter([report], [qcTask, transferTask])

    assert.equal(reportTask.title, '报工 注塑 · 100')
    assert.equal(actionTask.description.includes('网络异常'), true)
    assert.equal(center.summary.total, 3)
    assert.equal(center.summary.failed, 1)
    assert.equal(center.summary.pending, 1)
    assert.equal(center.summary.syncing, 1)
    assert.equal(center.summary.retryable, 2)
    assert.deepEqual(center.tasks.map((item) => item.syncStatus), ['failed', 'pending', 'syncing'])
    assert.equal(getOfflineTaskStatusText('failed'), '同步失败')
    assert.equal(getOfflineTaskSourceText('inventory'), '盘点')
  })
})

describe('移动端待办中心', () => {
  it('把报工、质检、盘点、调拨和可重试离线任务按优先级聚合', () => {
    const todos = buildMobileTodoItems({
      reportTasks: [{ workOrderId: 1, workOrderNo: 'MO-001', productName: '外壳', machineCode: 'A01' }],
      qcOrders: [{ workOrderId: 2, workOrderNo: 'MO-002', productName: '盖板' }],
      inventoryTasks: [{ id: 3, productCode: 'P-003', locationCode: 'L01' }],
      transferTasks: [{ id: 4, transferNo: 'TR-001', fromWarehouseName: '一仓', toWarehouseName: '二仓' }],
      offlineTasks: [
        { id: 'report-1', source: 'report', title: '报工失败', description: 'MO-001', syncStatus: 'failed', retryCount: 1, createdAt: '2026-07-04', canRetry: true, payload: {} },
        { id: 'report-2', source: 'report', title: '已同步', description: 'MO-003', syncStatus: 'synced', retryCount: 0, createdAt: '2026-07-04', canRetry: false, payload: {} },
      ],
    })

    assert.deepEqual(todos.map((item) => item.type), ['offline', 'report', 'qc', 'inventory', 'transfer'])
    assert.equal(todos[0].route, '/m/offline-tasks')
    assert.deepEqual(summarizeMobileTodos(todos), {
      total: 5,
      report: 1,
      qc: 1,
      inventory: 1,
      transfer: 1,
      offline: 1,
      injection: 0,
    })
  })
})
