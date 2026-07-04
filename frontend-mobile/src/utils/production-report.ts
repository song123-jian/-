export function normalizeMobileReportProcessName(value?: string | null) {
  return String(value || '').trim() || '注塑'
}

export function validateMobileReportProcessName(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return '请输入工序名称'
  if (text.length > 50) return '工序名称不能超过 50 个字符'
  return ''
}

function normalizeDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function chooseMobileReportPiecePrice(rows: any[], productId?: number, processName?: string, date?: string | Date) {
  if (!productId) return undefined
  const normalizedProcessName = normalizeMobileReportProcessName(processName)
  const normalizedDate = normalizeDateOnly(date || new Date())
  return rows
    .filter((row) => Number(row.product_id || row.productId) === Number(productId))
    .filter((row) => normalizeMobileReportProcessName(row.process_name || row.processName) === normalizedProcessName)
    .filter((row) => {
      if (!normalizedDate) return true
      const effectiveDate = normalizeDateOnly(row.effective_date || row.effectiveDate)
      const expireDate = normalizeDateOnly(row.expire_date || row.expireDate)
      return (!effectiveDate || effectiveDate <= normalizedDate) && (!expireDate || expireDate >= normalizedDate)
    })
    .sort((left, right) => {
      const rightDate = normalizeDateOnly(right.effective_date || right.effectiveDate)
      const leftDate = normalizeDateOnly(left.effective_date || left.effectiveDate)
      return rightDate.localeCompare(leftDate) || Number(right.id || 0) - Number(left.id || 0)
    })[0]
}

export function assertMobileReportPiecePrice(price: any, goodQty: number, productName: string, processName: string, workDate: string) {
  if (goodQty <= 0 || price?.id || price?.price !== undefined) return
  throw new Error(`${productName || '产品'} / ${processName || '注塑'} 在 ${workDate} 无有效计件单价，不能报工入账`)
}
