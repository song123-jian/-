import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSystemLogChangeSummary,
  buildSystemLogExportPackage,
  buildSystemLogQuery,
  buildSystemLogSummary,
  formatSystemLogValue,
  normalizeSystemLog,
  normalizeSystemLogAction,
  normalizeSystemLogKeyword,
  normalizeSystemLogList,
  systemLogActionRisk,
  systemLogActionTag,
  systemLogActionText,
} from '../frontend-admin/src/utils/system-logs.ts'

describe('system log normalization', () => {
  it('normalizes snake and camel case rows into an auditable page model', () => {
    const row = normalizeSystemLog({
      id: '12',
      username: '  admin  ',
      module: '  产品档案  ',
      action: 'delete',
      target_type: 'product',
      target_id: 88,
      old_value: '{"name":"A","api_key":"secret-value"}',
      new_value: '',
      ip: '  127.0.0.1  ',
      created_at: '2026-07-04 10:00:00',
    })

    assert.equal(row.id, 12)
    assert.equal(row.username, 'admin')
    assert.equal(row.module, '产品档案')
    assert.equal(row.action, 'DELETE')
    assert.equal(row.actionText, '删除')
    assert.equal(row.actionRisk, 'danger')
    assert.equal(row.actionTag, 'danger')
    assert.equal(row.targetType, 'product')
    assert.equal(row.targetId, '88')
    assert.equal(row.oldValueText, '{"api_key":"***","name":"A"}')
    assert.equal(row.newValueText, '-')
    assert.equal(row.changeSummary, '删除/清空记录')
    assert.equal(row.ip, '127.0.0.1')
    assert.equal(row.createdAt, '2026-07-04 10:00:00')
  })

  it('falls back safely for invalid and blank values', () => {
    assert.deepEqual(normalizeSystemLog({ id: 'bad', action: '', oldValue: null, newValue: undefined }), {
      id: 0,
      username: '系统',
      module: '-',
      action: 'OTHER',
      actionText: 'OTHER',
      actionRisk: 'normal',
      actionTag: 'info',
      targetType: '-',
      targetId: '-',
      oldValueText: '-',
      newValueText: '-',
      changeSummary: '未记录变更',
      ip: '-',
      createdAt: '',
    })
  })
})

describe('system log query and filtering', () => {
  it('builds bounded and safe service query params', () => {
    assert.deepEqual(buildSystemLogQuery({
      page: 0,
      pageSize: 999,
      keyword: '  模具,(删除)\\n%  ',
      action: 'DELETE',
      targetType: '  mold  ',
      startDate: '2026-07-01',
      endDate: 'bad',
    }), {
      page: 1,
      pageSize: 200,
      keyword: '模具 删除',
      action: 'DELETE',
      targetType: 'mold',
      startDate: '2026-07-01',
    })

    assert.equal(normalizeSystemLogKeyword(`  ${'a'.repeat(100)}  `).length, 80)
  })

  it('normalizes action aliases and maps display risk consistently', () => {
    assert.equal(normalizeSystemLogAction('新增'), 'CREATE')
    assert.equal(normalizeSystemLogAction('sign-out'), 'LOGOUT')
    assert.equal(systemLogActionText('UPDATE'), '修改')
    assert.equal(systemLogActionRisk('export'), 'warning')
    assert.equal(systemLogActionRisk('reject'), 'danger')
    assert.equal(systemLogActionTag('login'), 'success')
  })
})

describe('system log value and change summaries', () => {
  it('formats JSON and object values without leaking sensitive fields', () => {
    assert.equal(formatSystemLogValue({ token: 'abc', nested: { password_hash: 'secret', name: 'A' } }), '{"nested":{"name":"A","password_hash":"***"},"token":"***"}')
    assert.equal(formatSystemLogValue('  plain text  '), 'plain text')
    assert.equal(formatSystemLogValue(''), '-')
  })

  it('summarizes object field changes in a readable way', () => {
    assert.equal(buildSystemLogChangeSummary({ a: 1, b: 2 }, { a: 1, b: 3 }), '1 个字段变更：b')
    assert.equal(buildSystemLogChangeSummary({ password: 'old' }, { password: 'new' }), '1 个字段变更：敏感字段')
    assert.equal(buildSystemLogChangeSummary({ auth: { token: 'old' } }, { auth: { token: 'new' } }), '1 个字段变更：auth')
    assert.equal(buildSystemLogChangeSummary({ a: 1 }, { a: 1 }), '无字段差异')
    assert.equal(buildSystemLogChangeSummary('a', 'b'), '已记录变更')
    assert.equal(buildSystemLogChangeSummary('', '{"id":1}'), '新增记录')
  })
})

describe('system log summary and export', () => {
  it('summarizes page records by risk, changed rows, actors and modules', () => {
    const rows = normalizeSystemLogList([
      { id: 1, username: 'admin', module: '产品', action: 'DELETE', oldValue: { id: 1 }, newValue: null },
      { id: 2, username: 'admin', module: '产品', action: 'UPDATE', oldValue: { name: 'A' }, newValue: { name: 'B' } },
      { id: 3, username: 'qc', module: '质量', action: 'LOGIN' },
    ])

    assert.deepEqual(buildSystemLogSummary(rows), {
      total: 3,
      danger: 1,
      warning: 1,
      changed: 2,
      actorCount: 2,
      moduleCount: 2,
    })
  })

  it('builds a deterministic export package from normalized and redacted rows', () => {
    const rows = normalizeSystemLogList([
      { id: 1, username: 'admin', module: '系统', action: 'UPDATE', targetType: 'sys_config', targetId: 1, oldValue: { apiKey: 'a' }, newValue: { apiKey: 'b' } },
    ])
    const payload = buildSystemLogExportPackage(rows, '2026-07-04T00:00:00.000Z')

    assert.equal(payload.generatedAt, '2026-07-04T00:00:00.000Z')
    assert.equal(payload.summary.warning, 1)
    assert.deepEqual(payload.records[0], {
      id: 1,
      username: 'admin',
      module: '系统',
      action: '修改',
      risk: 'warning',
      target: 'sys_config#1',
      changeSummary: '1 个字段变更：敏感字段',
      oldValue: '{"apiKey":"***"}',
      newValue: '{"apiKey":"***"}',
      ip: '-',
      createdAt: '',
    })
  })
})
