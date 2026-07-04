import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getQcResultText,
  getQcUploadBlockingMessage,
  normalizeQcImageUrls,
  normalizeQcInspectionType,
  normalizeQcResult,
  validateMobileQcRecordInput,
} from '../frontend-mobile/src/utils/qc-record.ts'

describe('mobile qc record normalization', () => {
  it('normalizes inspection types, results and image urls', () => {
    assert.equal(normalizeQcInspectionType('ipqc'), 'IPQC')
    assert.equal(normalizeQcInspectionType('BAD'), '')
    assert.equal(normalizeQcResult('合格'), 'PASS')
    assert.equal(normalizeQcResult('FAIL'), 'FAIL')
    assert.equal(getQcResultText('PASS'), '合格')
    assert.deepEqual(normalizeQcImageUrls(' a.jpg, ,b.jpg '), ['a.jpg', 'b.jpg'])
  })
})

describe('mobile qc record validation', () => {
  const base = {
    workOrderId: 10,
    productId: 20,
    inspectionType: 'IPQC',
    result: '合格',
    sampleCount: 5,
  }

  it('allows a valid pass record without defect fields', () => {
    assert.equal(validateMobileQcRecordInput(base), '')
  })

  it('requires traceable defect fields for failed records', () => {
    assert.equal(
      validateMobileQcRecordInput({ ...base, result: '不合格', defectType: '', defectDesc: '尺寸偏小' }),
      '不合格质检必须填写缺陷类型'
    )
    assert.equal(
      validateMobileQcRecordInput({ ...base, result: 'FAIL', defectType: '尺寸', defectDesc: '' }),
      '不合格质检必须填写缺陷描述'
    )
    assert.equal(
      validateMobileQcRecordInput({ ...base, result: 'FAIL', defectType: '尺寸', defectDesc: '尺寸偏小' }),
      ''
    )
  })

  it('blocks missing work order/product and invalid sample quantity', () => {
    assert.equal(validateMobileQcRecordInput({ ...base, workOrderId: 0 }), '请选择待质检工单')
    assert.equal(validateMobileQcRecordInput({ ...base, productId: 0 }), '请选择有效的产品')
    assert.equal(validateMobileQcRecordInput({ ...base, sampleCount: 0 }), '抽样数量必须是大于 0 的整数')
    assert.equal(validateMobileQcRecordInput({ ...base, sampleCount: 1.5 }), '抽样数量必须是大于 0 的整数')
  })

  it('guards text and image count boundaries', () => {
    assert.equal(validateMobileQcRecordInput({ ...base, defectType: 'x'.repeat(51) }), '缺陷类型不能超过 50 个字符')
    assert.equal(validateMobileQcRecordInput({ ...base, defectDesc: 'x'.repeat(501) }), '缺陷描述不能超过 500 个字符')
    assert.equal(validateMobileQcRecordInput({ ...base, images: ['1', '2', '3', '4', '5'] }), '质检照片最多上传 4 张')
  })
})

describe('mobile qc upload state', () => {
  it('blocks submit while uploads are pending or failed', () => {
    assert.equal(getQcUploadBlockingMessage([{ status: 'done', url: 'a.jpg' }]), '')
    assert.equal(getQcUploadBlockingMessage([{ status: 'uploading' }]), '质检照片仍在上传，请稍后提交')
    assert.equal(getQcUploadBlockingMessage([{ status: 'failed' }]), '存在上传失败的质检照片，请删除或重新上传')
  })
})
