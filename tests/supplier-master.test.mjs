import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSupplierMasterSummary,
  buildSupplierPayload,
  buildSupplierQuery,
  getSupplierDataRisk,
  isSupplierPhoneAllowed,
  normalizeSupplierMaster,
  normalizeSupplierPhone,
  normalizeSupplierStatus,
  validateSupplierMaster,
} from '../frontend-admin/src/utils/supplier-master.ts'

describe('supplier master normalization', () => {
  it('normalizes database and page values into a stable supplier model', () => {
    assert.deepEqual(normalizeSupplierMaster({
      id: '6',
      code: '  GYS-001  ',
      name: '  Alpha Resin Co.  ',
      contact: '  Alice  ',
      phone: ' +86 21 8888-8888 ',
      address: '  Shanghai Test Road  ',
      main_material: '  PP resin  ',
      status: '禁用',
    }), {
      id: 6,
      code: 'GYS-001',
      name: 'Alpha Resin Co.',
      contact: 'Alice',
      phone: '+86218888-8888',
      address: 'Shanghai Test Road',
      mainMaterial: 'PP resin',
      status: '0',
    })
  })

  it('normalizes status and phone policy boundaries', () => {
    assert.equal(normalizeSupplierStatus('false'), '0')
    assert.equal(normalizeSupplierStatus('enabled'), '1')
    assert.equal(normalizeSupplierPhone(' 138 0013 8000 '), '13800138000')
    assert.equal(isSupplierPhoneAllowed('+86-21-88888888'), true)
    assert.equal(isSupplierPhoneAllowed('abc-phone'), false)
  })
})

describe('supplier master validation and payload', () => {
  it('accepts a complete supplier used by purchase, batch and stock flows', () => {
    const input = {
      code: 'GYS-001',
      name: 'Alpha Resin Co.',
      contact: 'Alice',
      phone: '+86-21-88888888',
      address: 'Shanghai Test Road 1',
      mainMaterial: 'PP resin',
      status: '1',
    }

    assert.equal(validateSupplierMaster(input), '')
    assert.deepEqual(buildSupplierPayload(input), input)
  })

  it('rejects invalid required fields, phone, text length and status', () => {
    assert.equal(validateSupplierMaster({ name: 'Alpha Resin Co.' }), '请输入供应商编号')
    assert.equal(validateSupplierMaster({ code: 'G', name: 'Alpha Resin Co.' }), '供应商编号需为 2-50 位字母、数字、点、下划线或短横线')
    assert.equal(validateSupplierMaster({ code: 'GYS-001' }), '请输入供应商名称')
    assert.equal(validateSupplierMaster({ code: 'GYS-001', name: 'Alpha Resin Co.', phone: 'abc-phone' }), '联系电话需为 6-20 位数字、括号、短横线或加号')
    assert.equal(validateSupplierMaster({ code: 'GYS-001', name: 'Alpha Resin Co.', mainMaterial: 'x'.repeat(201) }), '主营材料不能超过 200 个字符')
    assert.equal(validateSupplierMaster({ code: 'GYS-001', name: 'Alpha Resin Co.', status: 'UNKNOWN' }), '请选择有效状态')
  })

  it('allows partial edit payloads and explicit clearing without overwriting omitted fields', () => {
    assert.equal(validateSupplierMaster({ status: 'DISABLED' }, { isEditing: true }), '')
    assert.deepEqual(buildSupplierPayload({ status: 'DISABLED' }), { status: '0' })
    assert.equal(validateSupplierMaster({ phone: '', address: '', mainMaterial: '' }, { isEditing: true }), '')
    assert.deepEqual(buildSupplierPayload({ phone: '', address: '', mainMaterial: '' }), {
      phone: '',
      address: '',
      mainMaterial: '',
    })
  })

  it('builds bounded query params safe for PostgREST filters', () => {
    assert.deepEqual(buildSupplierQuery({ page: '0', pageSize: 999, keyword: ' 供应商,(PP)% ', status: '1' }), {
      page: 1,
      pageSize: 200,
      keyword: '供应商 PP',
      status: '1',
    })
  })
})

describe('supplier master summary and risk labels', () => {
  it('summarizes contact, material scope and data-risk completeness', () => {
    const rows = [
      normalizeSupplierMaster({ code: 'GYS-1', name: 'Alpha', contact: 'Alice', phone: '+86-21-88888888', mainMaterial: 'PP', status: '1' }),
      normalizeSupplierMaster({ code: 'GYS-2', name: 'Beta', status: '1' }),
      normalizeSupplierMaster({ code: 'GYS-3', name: 'Gamma', phone: 'abc-phone', mainMaterial: 'ABS', status: '0' }),
    ]

    assert.deepEqual(buildSupplierMasterSummary(rows), {
      total: 3,
      enabled: 2,
      disabled: 1,
      withContact: 2,
      withPhone: 2,
      withMainMaterial: 2,
      dataRisks: 2,
    })
    assert.equal(getSupplierDataRisk(rows[1]), '联系方式待补全')
    assert.equal(getSupplierDataRisk(rows[2]), '联系电话不合规')
  })
})
