import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSalaryPriceRow,
  chooseSalaryPiecePrice,
  findOverlappedSalaryPrice,
  getSalaryPriceStatus,
  getSalaryPriceStatusText,
  isSalaryPriceIntervalOverlap,
  normalizeSalaryPriceInput,
  normalizeSalaryProcessName,
  validateSalaryPriceInput,
} from '../frontend-admin/src/utils/salary-price.ts'

describe('salary piece price inputs', () => {
  it('normalizes process name, price, and date fields', () => {
    assert.equal(normalizeSalaryProcessName('  '), '注塑')
    assert.deepEqual(normalizeSalaryPriceInput({
      productId: '8',
      processName: ' 注塑 ',
      unitPrice: '0.12345',
      effectiveDate: '2026-07-03T08:00:00',
      expireDate: '',
    }), {
      id: undefined,
      productId: 8,
      processName: '注塑',
      price: 0.1235,
      effectiveDate: '2026-07-03',
      expireDate: '',
    })
  })

  it('validates required fields, positive price, and date range', () => {
    assert.equal(validateSalaryPriceInput({ productId: 0, processName: '注塑', price: 1, effectiveDate: '2026-07-01' }), '请选择产品')
    assert.equal(validateSalaryPriceInput({ productId: 1, processName: '', price: 1, effectiveDate: '2026-07-01' }), '')
    assert.equal(validateSalaryPriceInput({ productId: 1, processName: '注塑', price: 0, effectiveDate: '2026-07-01' }), '计件单价必须大于 0')
    assert.equal(validateSalaryPriceInput({ productId: 1, processName: '注塑', price: 1, effectiveDate: '' }), '请选择生效日期')
    assert.equal(validateSalaryPriceInput({ productId: 1, processName: '注塑', price: 1, effectiveDate: '2026-07-02', expireDate: '2026-07-01' }), '失效日期不能早于生效日期')
  })
})

describe('salary piece price intervals', () => {
  it('detects overlapping open and closed effective ranges', () => {
    assert.equal(isSalaryPriceIntervalOverlap(
      { effectiveDate: '2026-07-01', expireDate: '2026-07-31' },
      { effectiveDate: '2026-07-31', expireDate: '2026-08-15' },
    ), true)
    assert.equal(isSalaryPriceIntervalOverlap(
      { effectiveDate: '2026-07-01', expireDate: '2026-07-30' },
      { effectiveDate: '2026-07-31', expireDate: '' },
    ), false)
  })

  it('finds overlap only for the same product and process, excluding current row', () => {
    const rows = [
      { id: 1, productId: 3, processName: '注塑', effectiveDate: '2026-07-01', expireDate: '2026-07-31' },
      { id: 2, productId: 3, processName: '包装', effectiveDate: '2026-07-01', expireDate: '' },
    ]
    assert.equal(Boolean(findOverlappedSalaryPrice(rows, {
      productId: 3,
      processName: '注塑',
      price: 0.2,
      effectiveDate: '2026-07-15',
      expireDate: '2026-08-01',
    })), true)
    assert.equal(findOverlappedSalaryPrice(rows, {
      productId: 3,
      processName: '注塑',
      price: 0.2,
      effectiveDate: '2026-07-15',
      expireDate: '2026-08-01',
    }, 1), undefined)
  })
})

describe('salary piece price status and choosing', () => {
  const prices = [
    { id: 1, productId: 1, processName: '注塑', price: 0.1, effectiveDate: '2026-01-01', expireDate: '2026-06-30' },
    { id: 2, productId: 1, processName: '注塑', price: 0.12, effectiveDate: '2026-07-01', expireDate: '' },
    { id: 3, productId: 1, processName: '包装', price: 0.05, effectiveDate: '2026-07-01', expireDate: '' },
  ]

  it('returns readable status by date', () => {
    assert.equal(getSalaryPriceStatus({ effectiveDate: '2026-07-01' }, '2026-07-03'), 'ACTIVE')
    assert.equal(getSalaryPriceStatus({ effectiveDate: '2026-08-01' }, '2026-07-03'), 'FUTURE')
    assert.equal(getSalaryPriceStatus({ effectiveDate: '2026-06-01', expireDate: '2026-06-30' }, '2026-07-03'), 'EXPIRED')
    assert.equal(getSalaryPriceStatusText('ACTIVE'), '生效中')
  })

  it('chooses the active price for product, process and work date', () => {
    assert.equal(chooseSalaryPiecePrice(prices, 1, '注塑', '2026-06-30')?.price, 0.1)
    assert.equal(chooseSalaryPiecePrice(prices, 1, '注塑', '2026-07-03')?.price, 0.12)
    assert.equal(chooseSalaryPiecePrice(prices, 1, '包装', '2026-07-03')?.price, 0.05)
    assert.equal(chooseSalaryPiecePrice(prices, 1, '喷油', '2026-07-03'), undefined)
  })

  it('builds table rows with product display and thousand-piece preview', () => {
    assert.deepEqual(buildSalaryPriceRow(prices[1], { code: 'P001', name: '外壳' }, '2026-07-03'), {
      id: 2,
      productId: 1,
      productName: '外壳',
      productCode: 'P001',
      processName: '注塑',
      price: 0.12,
      unitPrice: 0.12,
      effectiveDate: '2026-07-01',
      expireDate: '',
      status: 'ACTIVE',
      statusText: '生效中',
      amountPreview: 120,
      createdAt: '',
    })
  })
})
