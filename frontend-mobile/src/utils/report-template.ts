export type MobileReportTemplate = {
  code: string
  name: string
  processName: string
  shift?: string
  defectCount?: number
  moldCountMode?: 'sameAsQty' | 'empty' | 'fixed'
  fixedMoldCount?: number
}

export const MOBILE_REPORT_TEMPLATES: MobileReportTemplate[] = [
  { code: 'injection-day', name: '注塑白班', processName: '注塑', shift: 'DAY', defectCount: 0, moldCountMode: 'sameAsQty' },
  { code: 'injection-night', name: '注塑夜班', processName: '注塑', shift: 'NIGHT', defectCount: 0, moldCountMode: 'sameAsQty' },
  { code: 'assembly-day', name: '装配白班', processName: '装配', shift: 'DAY', defectCount: 0, moldCountMode: 'empty' },
]

export type MobileReportFormLike = {
  processName?: string
  shift?: string
  quantity?: string | number
  defectCount?: string | number
  moldCount?: string | number
}

function normalizeQty(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0
}

export function findMobileReportTemplate(code?: string | null) {
  return MOBILE_REPORT_TEMPLATES.find((item) => item.code === code) || MOBILE_REPORT_TEMPLATES[0]
}

export function applyMobileReportTemplate(form: MobileReportFormLike, templateCode?: string | null) {
  const template = findMobileReportTemplate(templateCode)
  const quantity = normalizeQty(form.quantity)
  const next: MobileReportFormLike = {
    ...form,
    processName: template.processName,
    shift: template.shift || form.shift || 'DAY',
    defectCount: template.defectCount ?? form.defectCount ?? 0,
  }

  if (template.moldCountMode === 'sameAsQty' && quantity > 0) next.moldCount = quantity
  if (template.moldCountMode === 'fixed') next.moldCount = template.fixedMoldCount || 0
  if (template.moldCountMode === 'empty') next.moldCount = ''
  return next
}

export function buildMobileReportTemplateOptions() {
  return MOBILE_REPORT_TEMPLATES.map((item) => ({ text: item.name, value: item.code }))
}
