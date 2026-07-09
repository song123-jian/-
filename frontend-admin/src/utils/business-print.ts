export type BusinessPrintColumn<T = Record<string, any>> = {
  label: string
  prop?: keyof T | string
  value?: (row: T, index: number) => unknown
  align?: 'left' | 'right' | 'center'
}

export type BusinessPrintSection = {
  label: string
  value: unknown
}

export type BusinessPrintTotal = {
  label: string
  value: unknown
}

export type BusinessPrintOptions<T = Record<string, any>> = {
  title: string
  subtitle?: string
  sections?: BusinessPrintSection[]
  columns?: BusinessPrintColumn<T>[]
  rows?: T[]
  totals?: BusinessPrintTotal[]
  remark?: string
  printedAt?: Date
}

function cellText(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export function escapePrintHtml(value: unknown) {
  return cellText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printTime(value = new Date()) {
  return value.toLocaleString('zh-CN', { hour12: false })
}

export function buildBusinessDocumentHtml<T = Record<string, any>>(options: BusinessPrintOptions<T>) {
  const columns = options.columns || []
  const rows = options.rows || []
  const sections = options.sections || []
  const totals = options.totals || []
  const sectionHtml = sections.map((item) => `
    <div class="info-item">
      <span>${escapePrintHtml(item.label)}</span>
      <strong>${escapePrintHtml(item.value)}</strong>
    </div>`).join('')
  const headerHtml = columns.map((column) => `<th class="${column.align || 'left'}">${escapePrintHtml(column.label)}</th>`).join('')
  const rowsHtml = rows.map((row, index) => {
    const cells = columns.map((column) => {
      const value = column.value ? column.value(row, index) : column.prop ? (row as any)[column.prop as string] : ''
      return `<td class="${column.align || 'left'}">${escapePrintHtml(value)}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  const totalsHtml = totals.map((item) => `
    <div class="total-item">
      <span>${escapePrintHtml(item.label)}</span>
      <strong>${escapePrintHtml(item.value)}</strong>
    </div>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapePrintHtml(options.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; color: #1f2933; font-family: "Microsoft YaHei", Arial, sans-serif; }
    .document { max-width: 980px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1f2933; padding-bottom: 16px; }
    h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
    .subtitle { margin-top: 6px; color: #5f6f7f; font-size: 13px; }
    .printed-at { color: #5f6f7f; font-size: 12px; text-align: right; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; margin: 18px 0; }
    .info-item { display: grid; gap: 3px; }
    .info-item span, .remark span, .total-item span { color: #6b7785; font-size: 12px; }
    .info-item strong { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #d8dee8; padding: 8px 10px; font-size: 13px; }
    th { background: #f3f6fb; font-weight: 600; }
    .right { text-align: right; }
    .center { text-align: center; }
    .totals { display: flex; justify-content: flex-end; gap: 20px; margin-top: 14px; }
    .total-item { min-width: 140px; text-align: right; }
    .total-item strong { display: block; margin-top: 4px; font-size: 16px; }
    .remark { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e6eaf0; }
    .signature { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 34px; color: #5f6f7f; font-size: 13px; }
    .signature span { border-top: 1px solid #c8d0da; padding-top: 8px; }
    @media print { body { padding: 0; } .document { max-width: none; } }
  </style>
</head>
<body>
  <main class="document">
    <header class="header">
      <div>
        <h1>${escapePrintHtml(options.title)}</h1>
        <div class="subtitle">${escapePrintHtml(options.subtitle || '')}</div>
      </div>
      <div class="printed-at">打印时间<br />${escapePrintHtml(printTime(options.printedAt))}</div>
    </header>
    <section class="info-grid">${sectionHtml}</section>
    ${columns.length ? `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>` : ''}
    ${totals.length ? `<section class="totals">${totalsHtml}</section>` : ''}
    ${options.remark ? `<section class="remark"><span>备注</span><div>${escapePrintHtml(options.remark)}</div></section>` : ''}
    <section class="signature">
      <span>制单</span>
      <span>审核</span>
      <span>签收</span>
    </section>
  </main>
</body>
</html>`
}

export function printBusinessDocument<T = Record<string, any>>(options: BusinessPrintOptions<T>) {
  const html = buildBusinessDocumentHtml(options)
  const printWindow = window.open('', '_blank', 'width=1100,height=780')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(() => {
    printWindow.print()
  }, 120)
  return true
}
