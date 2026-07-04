import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildProductMasterSummary,
  buildProductPayload,
  buildProductQuery,
  getProductDataRisk,
  isProductImageUrlAllowed,
  normalizeProductMaster,
  normalizeProductStatus,
  normalizeProductType,
  productImageAlt,
  validateProductMaster,
} from '../frontend-admin/src/utils/product-master.ts'

describe('product master normalization', () => {
  it('normalizes compatible database and page values into one master-data model', () => {
    assert.deepEqual(normalizeProductMaster({
      id: '12',
      code: '  CP-001  ',
      name: '  透明杯  ',
      type: 'finish',
      unit: '',
      piece_price: '1.23456',
      cavity_yield: '8',
      cycle_time_sec: '12.8',
      safe_stock: '30.9',
      weight_g: '15.236',
      raw_material_id: '5',
      raw_material_usage: '1.23456',
      customer_id: '9',
      image_url: ' https://cdn.example.com/p.png ',
      status: '禁用',
    }), {
      id: 12,
      code: 'CP-001',
      name: '透明杯',
      type: 'FINISH',
      spec: '',
      unit: '个',
      piecePrice: 1.2346,
      cavityYield: 8,
      cycleTimeSec: 12,
      safeStock: 30,
      weightG: 15.24,
      rawMaterialId: 5,
      rawMaterialUsage: 1.2346,
      color: '',
      customerId: 9,
      imageUrl: 'https://cdn.example.com/p.png',
      status: '0',
    })
  })

  it('normalizes product type, status and image policy boundaries', () => {
    assert.equal(normalizeProductType('raw'), 'RAW')
    assert.equal(normalizeProductType('bad'), 'FINISH')
    assert.equal(normalizeProductStatus('false'), '0')
    assert.equal(normalizeProductStatus('enabled'), '1')
    assert.equal(isProductImageUrlAllowed('https://cdn.example.com/a.jpg'), true)
    assert.equal(isProductImageUrlAllowed('/assets/product/a.jpg'), true)
    assert.equal(isProductImageUrlAllowed('http://unsafe.example.com/a.jpg'), false)
  })
})

describe('product master validation and payload', () => {
  it('accepts a complete product used by production, stock and sales flows', () => {
    const input = {
      code: 'CP-001',
      name: '透明杯',
      type: 'FINISH',
      spec: '500ml',
      unit: '个',
      piecePrice: 1.23,
      safeStock: 100,
      weightG: 16.5,
      rawMaterialId: 1,
      rawMaterialUsage: 1.2,
      cavityYield: 8,
      cycleTimeSec: 12,
      color: '透明',
      customerId: 9,
      imageUrl: 'https://cdn.example.com/cup.png',
      status: '1',
    }

    assert.equal(validateProductMaster(input), '')
    assert.deepEqual(buildProductPayload(input), {
      code: 'CP-001',
      name: '透明杯',
      type: 'FINISH',
      spec: '500ml',
      unit: '个',
      piecePrice: 1.23,
      cavityYield: 8,
      cycleTimeSec: 12,
      safeStock: 100,
      weightG: 16.5,
      rawMaterialId: 1,
      rawMaterialUsage: 1.2,
      color: '透明',
      customerId: 9,
      imageUrl: 'https://cdn.example.com/cup.png',
      status: '1',
    })
  })

  it('rejects invalid required text, numeric ranges and material relationships', () => {
    assert.equal(validateProductMaster({ name: '杯', unit: '个' }), '请输入产品编码')
    assert.equal(validateProductMaster({ code: 'A', name: '杯', unit: '个' }), '产品编码需为 2-50 位字母、数字、点、下划线或短横线')
    assert.equal(validateProductMaster({ code: 'CP-001', unit: '个' }), '请输入产品名称')
    assert.equal(validateProductMaster({ code: 'CP-001', name: '杯', unit: '个', type: 'BAD' }), '请选择有效产品类型')
    assert.equal(validateProductMaster({ code: 'CP-001', name: '杯', unit: '个', type: 'FINISH', safeStock: -1 }), '安全库存必须是 0-99999999 的整数')
    assert.equal(validateProductMaster({ code: 'CP-001', name: '杯', unit: '个', type: 'FINISH', rawMaterialId: 'x' }), '原料产品ID必须是非负整数')
    assert.equal(validateProductMaster({ code: 'CP-001', name: '杯', unit: '个', type: 'FINISH', rawMaterialUsage: 1 }), '填写原料用量时必须填写原料产品ID')
    assert.equal(validateProductMaster({ code: 'CP-001', name: '杯', unit: '个', type: 'FINISH', id: 3, rawMaterialId: 3, rawMaterialUsage: 1 }), '产品不能把自身设置为原料')
    assert.equal(validateProductMaster({ code: 'CP-001', name: '杯', unit: '个', type: 'FINISH', imageUrl: 'http://unsafe.example.com/a.jpg' }), '产品图片地址必须是 HTTPS 地址或站内路径，且不超过 500 个字符')
  })

  it('allows partial edit payloads and explicit clearing without overwriting omitted fields', () => {
    assert.equal(validateProductMaster({ status: 'DISABLED' }, { isEditing: true }), '')
    assert.deepEqual(buildProductPayload({ status: 'DISABLED' }), { status: '0' })
    assert.equal(validateProductMaster({ imageUrl: '', rawMaterialId: 0, rawMaterialUsage: 0, customerId: 0 }, { isEditing: true }), '')
    assert.deepEqual(buildProductPayload({ imageUrl: '', rawMaterialId: 0, rawMaterialUsage: 0, customerId: 0 }), {
      rawMaterialId: null,
      rawMaterialUsage: 0,
      customerId: null,
      imageUrl: '',
    })
  })

  it('builds bounded query params safe for PostgREST filters', () => {
    assert.deepEqual(buildProductQuery({ page: '0', pageSize: 999, keyword: ' 杯,(透明)% ', type: 'raw', status: '1' }), {
      page: 1,
      pageSize: 200,
      keyword: '杯 透明',
      type: 'RAW',
      status: '1',
    })
  })
})

describe('product master summary and risk labels', () => {
  it('summarizes image, process, material and data-risk completeness', () => {
    const rows = [
      normalizeProductMaster({ code: 'RAW-1', name: 'PP', type: 'RAW', status: '1', imageUrl: 'https://cdn.example.com/raw.png' }),
      normalizeProductMaster({ code: 'CP-1', name: '杯', type: 'FINISH', status: '1', cavityYield: 8, cycleTimeSec: 12, rawMaterialId: 1, rawMaterialUsage: 1.2, safeStock: 10 }),
      normalizeProductMaster({ code: 'CP-2', name: '盖', type: 'FINISH', status: '0' }),
    ]

    assert.deepEqual(buildProductMasterSummary(rows), {
      total: 3,
      raw: 1,
      semi: 0,
      finish: 2,
      enabled: 2,
      disabled: 1,
      withImage: 1,
      withSafeStock: 1,
      withProcessParams: 1,
      withMaterialRule: 1,
      dataRisks: 1,
    })
    assert.equal(getProductDataRisk(rows[2]), '工艺参数待补全')
    assert.equal(productImageAlt(rows[1]), 'CP-1 杯')
  })
})
