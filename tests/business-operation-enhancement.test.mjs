import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { buildBusinessAuditLog } from '../frontend-admin/src/utils/business-audit.ts'
import { buildBusinessDocumentHtml, escapePrintHtml } from '../frontend-admin/src/utils/business-print.ts'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function assertIncludesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} should include ${value}`)
  }
}

describe('business operation audit utility', () => {
  it('builds a stable operation log payload for export and print actions', () => {
    const payload = buildBusinessAuditLog({
      module: '销售订单',
      action: 'EXPORT',
      targetType: 'sale_order',
      targetId: 'filtered',
      count: 12,
      scope: '当前筛选',
      filename: '销售订单导出.xls',
      detail: { status: 'APPROVED' },
    }, '2026-07-06T08:00:00.000Z')
    const detail = JSON.parse(payload.newValue)

    assert.equal(payload.module, '销售订单')
    assert.equal(payload.action, 'EXPORT')
    assert.equal(payload.targetType, 'sale_order')
    assert.equal(payload.targetId, 'filtered')
    assert.equal(payload.createdAt, '2026-07-06T08:00:00.000Z')
    assert.equal(detail.count, 12)
    assert.equal(detail.filename, '销售订单导出.xls')
    assert.equal(detail.status, 'APPROVED')
  })
})

describe('business print utility', () => {
  it('escapes printable document html and renders sections, rows and totals', () => {
    const html = buildBusinessDocumentHtml({
      title: '发货单<测试>',
      subtitle: 'FH-001',
      printedAt: new Date('2026-07-06T08:00:00'),
      sections: [{ label: '客户', value: '<华东客户>' }],
      columns: [
        { label: '产品', prop: 'productName' },
        { label: '数量', prop: 'qty', align: 'right' },
      ],
      rows: [{ productName: '<透明外壳>', qty: 10 }],
      totals: [{ label: '发货总数', value: 10 }],
      remark: '含 & 符号',
    })

    assert.equal(escapePrintHtml('<A&B>'), '&lt;A&amp;B&gt;')
    assert.match(html, /发货单&lt;测试&gt;/)
    assert.match(html, /&lt;华东客户&gt;/)
    assert.match(html, /&lt;透明外壳&gt;/)
    assert.match(html, /发货总数/)
    assert.match(html, /制单/)
  })
})

describe('business operation page wiring', () => {
  const sources = {
    systemApi: read('../frontend-admin/src/api/system.ts'),
    customers: read('../frontend-admin/src/views/base/customers.vue'),
    saleOrders: read('../frontend-admin/src/views/sale/orders.vue'),
    deliveries: read('../frontend-admin/src/views/sale/deliveries.vue'),
    payments: read('../frontend-admin/src/views/sale/payments.vue'),
    purchaseOrders: read('../frontend-admin/src/views/purchase/orders.vue'),
  }

  it('exposes a system log create API for operation audit writes', () => {
    assert.match(sources.systemApi, /createOperationLog/)
    assert.match(sources.systemApi, /request\.post\('\/system\/logs'/)
  })

  it('records audit events for all requested Excel exports', () => {
    for (const [label, source] of Object.entries({
      customers: sources.customers,
      saleOrders: sources.saleOrders,
      deliveries: sources.deliveries,
      payments: sources.payments,
      purchaseOrders: sources.purchaseOrders,
    })) {
      assertIncludesAll(source, ['recordBusinessAudit', "action: 'EXPORT'", 'filename,'], label)
    }
  })

  it('adds printable documents to sales, delivery, payment and purchase order rows', () => {
    for (const [label, source] of Object.entries({
      saleOrders: sources.saleOrders,
      deliveries: sources.deliveries,
      payments: sources.payments,
      purchaseOrders: sources.purchaseOrders,
    })) {
      assertIncludesAll(source, ['printBusinessDocument', 'handlePrint', "action: 'PRINT'", '打印窗口被浏览器拦截'], label)
    }
  })
})
