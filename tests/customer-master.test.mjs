import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCustomerMasterSummary,
  buildCustomerPayload,
  buildCustomerQuery,
  getCustomerCreditLabel,
  getCustomerDataRisk,
  isCustomerPhoneAllowed,
  isCustomerTaxNoAllowed,
  normalizeCustomerCreditLevel,
  normalizeCustomerMaster,
  normalizeCustomerStatus,
  validateCustomerMaster,
} from '../frontend-admin/src/utils/customer-master.ts'

describe('customer master normalization', () => {
  it('normalizes database and page values into a stable customer model', () => {
    assert.deepEqual(normalizeCustomerMaster({
      id: '8',
      code: '  KH-001  ',
      name: '  华东客户有限公司  ',
      short_name: ' 华东客户 ',
      contact: ' 张三 ',
      phone: ' 138 0013 8000 ',
      address: ' 上海市测试路 ',
      tax_no: ' 91310000MA1K00000X ',
      invoice_title: ' 华东客户有限公司 ',
      credit_level: 'a',
      payment_days: '45.9',
      sales_user_id: '6',
      status: '禁用',
    }), {
      id: 8,
      code: 'KH-001',
      name: '华东客户有限公司',
      shortName: '华东客户',
      contact: '张三',
      phone: '13800138000',
      address: '上海市测试路',
      taxNo: '91310000MA1K00000X',
      invoiceTitle: '华东客户有限公司',
      creditLevel: 'A',
      paymentDays: 45,
      salesUserId: 6,
      status: '0',
    })
  })

  it('normalizes status, credit level, phone and tax boundaries', () => {
    assert.equal(normalizeCustomerStatus('false'), '0')
    assert.equal(normalizeCustomerStatus('enabled'), '1')
    assert.equal(normalizeCustomerCreditLevel('cash'), 'CASH')
    assert.equal(normalizeCustomerCreditLevel('bad'), 'B')
    assert.equal(getCustomerCreditLabel('D'), 'D级')
    assert.equal(isCustomerPhoneAllowed('+86-21-88888888'), true)
    assert.equal(isCustomerPhoneAllowed('abc-phone'), false)
    assert.equal(isCustomerTaxNoAllowed('91310000MA1K00000X'), true)
    assert.equal(isCustomerTaxNoAllowed('中文税号'), false)
  })
})

describe('customer master validation and payload', () => {
  it('accepts a complete customer used by sales, delivery, receivable and invoice flows', () => {
    const input = {
      code: 'KH-001',
      name: '华东客户有限公司',
      shortName: '华东客户',
      contact: '张三',
      phone: '+86-21-88888888',
      address: '上海市测试路 1 号',
      taxNo: '91310000MA1K00000X',
      invoiceTitle: '华东客户有限公司',
      creditLevel: 'A',
      paymentDays: 45,
      salesUserId: 6,
      status: '1',
    }

    assert.equal(validateCustomerMaster(input), '')
    assert.deepEqual(buildCustomerPayload(input), {
      code: 'KH-001',
      name: '华东客户有限公司',
      shortName: '华东客户',
      contact: '张三',
      phone: '+86-21-88888888',
      address: '上海市测试路 1 号',
      taxNo: '91310000MA1K00000X',
      invoiceTitle: '华东客户有限公司',
      creditLevel: 'A',
      paymentDays: 45,
      salesUserId: 6,
      status: '1',
    })
  })

  it('rejects invalid required fields, invoice pairs, credit terms and ids', () => {
    assert.equal(validateCustomerMaster({ name: '客户' }), '请输入客户编号')
    assert.equal(validateCustomerMaster({ code: 'K', name: '客户' }), '客户编号需为 2-50 位字母、数字、点、下划线或短横线')
    assert.equal(validateCustomerMaster({ code: 'KH-001' }), '请输入客户名称')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', phone: 'abc-phone' }), '联系电话需为 6-20 位数字、括号、短横线或加号')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', taxNo: '91310000MA1K00000X' }), '填写税号时必须填写发票抬头')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', invoiceTitle: '客户公司' }), '填写发票抬头时必须填写税号')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', creditLevel: 'BAD' }), '请选择有效信用等级')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', creditLevel: 'CASH', paymentDays: 1 }), '现结客户账期必须为 0 天')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', creditLevel: 'D', paymentDays: 31 }), 'D级客户账期不能超过 30 天')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', paymentDays: 366 }), '账期必须是 0-365 天的整数')
    assert.equal(validateCustomerMaster({ code: 'KH-001', name: '客户', salesUserId: 'x' }), '销售员ID必须是非负整数')
  })

  it('allows partial edit payloads and explicit clearing without overwriting omitted fields', () => {
    assert.equal(validateCustomerMaster({ status: 'DISABLED' }, { isEditing: true }), '')
    assert.deepEqual(buildCustomerPayload({ status: 'DISABLED' }), { status: '0' })
    assert.equal(validateCustomerMaster({ phone: '', taxNo: '', invoiceTitle: '', salesUserId: 0, paymentDays: 0 }, { isEditing: true }), '')
    assert.deepEqual(buildCustomerPayload({ phone: '', taxNo: '', invoiceTitle: '', salesUserId: 0, paymentDays: 0 }), {
      phone: '',
      taxNo: '',
      invoiceTitle: '',
      paymentDays: 0,
      salesUserId: null,
    })
  })

  it('builds bounded query params safe for PostgREST filters', () => {
    assert.deepEqual(buildCustomerQuery({ page: '0', pageSize: 999, keyword: ' 客户,(华东)% ', status: '1', creditLevel: 'cash' }), {
      page: 1,
      pageSize: 200,
      keyword: '客户 华东',
      status: '1',
      creditLevel: 'CASH',
    })
  })
})

describe('customer master summary and risk labels', () => {
  it('summarizes tax, contact, ownership, payment terms and data risks', () => {
    const rows = [
      normalizeCustomerMaster({ code: 'KH-1', name: '甲', contact: '张三', taxNo: '91310000MA1K00000X', invoiceTitle: '甲公司', paymentDays: 30, salesUserId: 1, status: '1' }),
      normalizeCustomerMaster({ code: 'KH-2', name: '乙', creditLevel: 'CASH', paymentDays: 0, status: '1' }),
      normalizeCustomerMaster({ code: 'KH-3', name: '丙', creditLevel: 'B', paymentDays: 181, status: '0' }),
    ]

    assert.deepEqual(buildCustomerMasterSummary(rows), {
      total: 3,
      enabled: 2,
      disabled: 1,
      withTaxInfo: 1,
      withContact: 1,
      assignedSales: 1,
      cashCustomers: 1,
      longPaymentTerm: 1,
      dataRisks: 2,
    })
    assert.equal(getCustomerDataRisk(rows[1]), '联系人待补全')
    assert.equal(getCustomerDataRisk(rows[2]), '联系人待补全')
  })
})
