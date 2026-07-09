import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildExcelHtmlTable,
  escapeExcelHtml,
  normalizeExcelFileName,
} from '../frontend-admin/src/utils/export-excel.ts'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function assertIncludesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} should include ${value}`)
  }
}

describe('excel export utility', () => {
  it('normalizes xls filenames for Excel-compatible exports', () => {
    assert.equal(normalizeExcelFileName('客户管理导出.xlsx'), '客户管理导出.xls')
    assert.equal(normalizeExcelFileName('销售订单导出.xls'), '销售订单导出.xls')
    assert.match(normalizeExcelFileName(''), /^导出_\d+\.xls$/)
  })

  it('escapes html and formula-like cell values', () => {
    assert.equal(escapeExcelHtml('<客户&A>'), '&lt;客户&amp;A&gt;')
    assert.equal(escapeExcelHtml('=1+1'), '&#39;=1+1')
    assert.equal(escapeExcelHtml('-SUM(A1:A2)'), '&#39;-SUM(A1:A2)')
  })

  it('builds an Excel-readable html table and keeps headers for empty data', () => {
    const columns = [
      { label: '客户编号', prop: 'code' },
      { label: '客户名称', prop: 'name' },
      { label: '风险值', value: (row) => row.risk },
    ]
    const html = buildExcelHtmlTable([{ code: 'KH-001', name: '<华东客户>', risk: '=1+1' }], columns, '客户管理')
    const emptyHtml = buildExcelHtmlTable([], columns, '空表')

    assert.match(html, /<caption>客户管理<\/caption>/)
    assert.match(html, /<th>客户编号<\/th>/)
    assert.match(html, /&lt;华东客户&gt;/)
    assert.match(html, /&#39;=1\+1/)
    assert.match(emptyHtml, /<thead><tr><th>客户编号<\/th><th>客户名称<\/th><th>风险值<\/th><\/tr><\/thead>/)
  })
})

describe('business pages export wiring', () => {
  const schemaSource = read('../frontend-admin/src/views/base/base-data-schema.ts')
  const pageSources = {
    customers: read('../frontend-admin/src/views/base/customers.vue'),
    saleOrders: read('../frontend-admin/src/views/sale/orders.vue'),
    deliveries: read('../frontend-admin/src/views/sale/deliveries.vue'),
    payments: read('../frontend-admin/src/views/sale/payments.vue'),
    purchaseOrders: read('../frontend-admin/src/views/purchase/orders.vue'),
  }

  it('adds the customer export toolbar action and handler', () => {
    assert.match(schemaSource, /customerPageConfig[\s\S]*toolbarActions: \[toolbar\.add, toolbar\.refresh, toolbar\.export\]/)
    assertIncludesAll(pageSources.customers, [
      'exportExcelFile',
      'customerExportColumns',
      "key === 'export'",
      'handleExport',
      '客户管理导出_',
      'pageSize: 10000',
    ], 'customer export')
  })

  it('adds Excel export actions to sales and purchase pages', () => {
    for (const [label, source] of Object.entries({
      saleOrders: pageSources.saleOrders,
      deliveries: pageSources.deliveries,
      payments: pageSources.payments,
      purchaseOrders: pageSources.purchaseOrders,
    })) {
      assertIncludesAll(source, ['exportExcelFile', 'handleExport', '导出Excel'], label)
    }
    for (const [label, source] of Object.entries({
      saleOrders: pageSources.saleOrders,
      deliveries: pageSources.deliveries,
      payments: pageSources.payments,
    })) {
      assert.match(source, /pageSize: 10000/, `${label} should export current filtered result set`)
    }
    assert.match(pageSources.purchaseOrders, /const exportRows = filteredRows\.value/)
  })
})
