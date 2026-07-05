export type AuditDiffLevel = 'normal' | 'warning' | 'danger'

export type AuditFieldDiff = {
  field: string
  label: string
  before: string
  after: string
  level: AuditDiffLevel
}

export type AuditTrailEntry = {
  module: string
  action: string
  target: string
  operator: string
  changedAt: string
  diffCount: number
  riskLevel: AuditDiffLevel
  diffs: AuditFieldDiff[]
}

const SENSITIVE_FIELD_PATTERN = /(password|passwd|pwd|token|secret|api[_-]?key|authorization|credential|密钥|密码|令牌)/i
const DANGER_FIELD_PATTERN = /(price|amount|qty|quantity|stock|status|role|permission|单价|金额|数量|库存|状态|角色|权限)/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function parseAuditValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!/^[{[]/.test(text)) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function stableText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (value instanceof Date) return value.toISOString()
  if (isPlainObject(value) || Array.isArray(value)) return JSON.stringify(value)
  return String(value).trim() || '-'
}

function displayText(value: unknown, field = '') {
  if (SENSITIVE_FIELD_PATTERN.test(field)) return '***'
  const text = stableText(value)
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

function diffLevel(field: string): AuditDiffLevel {
  if (SENSITIVE_FIELD_PATTERN.test(field) || DANGER_FIELD_PATTERN.test(field)) return 'warning'
  return 'normal'
}

function normalizeObject(value: unknown): Record<string, unknown> {
  const parsed = parseAuditValue(value)
  return isPlainObject(parsed) ? parsed : {}
}

function normalizeLabel(field: string, labels: Record<string, string>) {
  if (SENSITIVE_FIELD_PATTERN.test(field)) return labels[field] || '敏感字段'
  return labels[field] || field
}

export function buildAuditFieldDiffs(
  beforeValue: unknown,
  afterValue: unknown,
  labels: Record<string, string> = {},
): AuditFieldDiff[] {
  const before = normalizeObject(beforeValue)
  const after = normalizeObject(afterValue)
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()

  return keys
    .filter((key) => stableText(before[key]) !== stableText(after[key]))
    .map((key) => ({
      field: key,
      label: normalizeLabel(key, labels),
      before: displayText(before[key], key),
      after: displayText(after[key], key),
      level: diffLevel(key),
    }))
}

export function buildAuditTrailEntry(input: {
  module?: string | null
  action?: string | null
  targetType?: string | null
  targetId?: string | number | null
  operator?: string | null
  changedAt?: string | null
  before?: unknown
  after?: unknown
  labels?: Record<string, string>
}): AuditTrailEntry {
  const diffs = buildAuditFieldDiffs(input.before, input.after, input.labels)
  const riskLevel: AuditDiffLevel = diffs.some((item) => item.level === 'danger')
    ? 'danger'
    : diffs.some((item) => item.level === 'warning')
      ? 'warning'
      : 'normal'
  return {
    module: String(input.module || '-').trim() || '-',
    action: String(input.action || '-').trim() || '-',
    target: `${String(input.targetType || '-').trim() || '-'}#${String(input.targetId || '-').trim() || '-'}`,
    operator: String(input.operator || '系统').trim() || '系统',
    changedAt: String(input.changedAt || '').trim(),
    diffCount: diffs.length,
    riskLevel,
    diffs,
  }
}

export function summarizeAuditEntries(rows: AuditTrailEntry[]) {
  return rows.reduce(
    (summary, row) => {
      summary.entryCount += 1
      summary.diffCount += row.diffCount
      if (row.riskLevel === 'warning') summary.warningCount += 1
      if (row.riskLevel === 'danger') summary.dangerCount += 1
      return summary
    },
    { entryCount: 0, diffCount: 0, warningCount: 0, dangerCount: 0 },
  )
}
