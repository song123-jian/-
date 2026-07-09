export type ExcelColumn<T = Record<string, any>> = {
  label: string
  prop?: keyof T | string
  value?: (row: T, index: number) => unknown
}

export type ExportExcelFileOptions<T = Record<string, any>> = {
  filename: string
  sheetName?: string
  columns: ExcelColumn<T>[]
  rows: T[]
}

function normalizeCellValue(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/^[=+@]/.test(text) || /^-[^\d.]/.test(text)) {
    return `'${text}`
  }
  return text
}

export function escapeExcelHtml(value: unknown) {
  return normalizeCellValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeExcelFileName(filename: string) {
  const text = String(filename || '').trim() || `导出_${Date.now()}`
  return /\.xls$/i.test(text) ? text : `${text.replace(/\.[^.]+$/, '')}.xls`
}

export function buildExcelHtmlTable<T = Record<string, any>>(rows: T[], columns: ExcelColumn<T>[], sheetName = 'Sheet1') {
  const safeSheetName = escapeExcelHtml(sheetName || 'Sheet1')
  const header = columns
    .map((column) => `<th>${escapeExcelHtml(column.label)}</th>`)
    .join('')
  const body = rows
    .map((row, rowIndex) => {
      const cells = columns
        .map((column) => {
          const value = column.value ? column.value(row, rowIndex) : column.prop ? (row as any)[column.prop as string] : ''
          return `<td style="mso-number-format:'\\@';">${escapeExcelHtml(value)}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d9d9d9; padding: 6px 8px; white-space: nowrap; }
    th { background: #f3f6fb; font-weight: 600; }
  </style>
</head>
<body>
  <table>
    <caption>${safeSheetName}</caption>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`
}

export function exportExcelFile<T = Record<string, any>>(options: ExportExcelFileOptions<T>) {
  const filename = normalizeExcelFileName(options.filename)
  const html = buildExcelHtmlTable(options.rows, options.columns, options.sheetName)
  const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
