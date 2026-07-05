export type MrpRiskLevel = 'normal' | 'warning' | 'danger'

export type BomComponentRow = {
  parentProductId?: number | string | null
  productId?: number | string | null
  productCode?: string | null
  productName?: string | null
  materialId?: number | string | null
  materialCode?: string | null
  materialName?: string | null
  unit?: string | null
  qtyPerParent?: number | string | null
  qtyPer?: number | string | null
  usageQty?: number | string | null
  lossRate?: number | string | null
  scrapRate?: number | string | null
}

export type MrpDemandRow = {
  orderId?: number | string | null
  orderNo?: string | null
  productId?: number | string | null
  productCode?: string | null
  productName?: string | null
  demandQty?: number | string | null
  planQty?: number | string | null
  qty?: number | string | null
  dueDate?: string | null
  deliveryDate?: string | null
  status?: string | null
}

export type MrpStockRow = {
  materialId?: number | string | null
  productId?: number | string | null
  materialCode?: string | null
  productCode?: string | null
  availableQty?: number | string | null
  qty?: number | string | null
  lockedQty?: number | string | null
  incomingQty?: number | string | null
  safetyStock?: number | string | null
  safeStock?: number | string | null
}

export type MrpRequirementSource = {
  orderNo: string
  productName: string
  dueDate: string
  qty: number
  requiredQty: number
}

export type MrpRequirementRow = {
  materialId: number
  materialCode: string
  materialName: string
  unit: string
  grossQty: number
  lossQty: number
  requiredQty: number
  availableQty: number
  incomingQty: number
  safetyStock: number
  netRequiredQty: number
  shortageQty: number
  coverageRate: number
  riskLevel: MrpRiskLevel
  sourceOrders: MrpRequirementSource[]
}

export type MrpSummary = {
  materialCount: number
  shortageCount: number
  warningCount: number
  totalRequiredQty: number
  totalShortageQty: number
  topShortages: MrpRequirementRow[]
}

const CLOSED_DEMAND_STATUSES = new Set(['CANCELLED', 'CLOSED', 'COMPLETED', 'DONE', 'FINISHED'])

function toMrpNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundMrpQty(value: unknown) {
  return Number(toMrpNumber(value).toFixed(3))
}

function normalizeMrpId(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0
}

function normalizeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeRate(value: unknown) {
  const text = String(value ?? '').trim()
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1))
    return Number.isFinite(percent) && percent > 0 ? percent / 100 : 0
  }
  const num = toMrpNumber(value)
  if (num <= 0) return 0
  return num > 1 ? num / 100 : num
}

function demandStatusActive(value?: string | null) {
  const status = String(value || '').trim().toUpperCase()
  return !CLOSED_DEMAND_STATUSES.has(status)
}

function materialKeyFromBom(row: BomComponentRow) {
  return String(normalizeMrpId(row.materialId) || normalizeText(row.materialCode || row.materialName))
}

function materialKeyFromStock(row: MrpStockRow) {
  return String(normalizeMrpId(row.materialId ?? row.productId) || normalizeText(row.materialCode || row.productCode))
}

function requirementRisk(shortageQty: number, coverageRate: number): MrpRiskLevel {
  if (shortageQty > 0) return 'danger'
  if (coverageRate < 100) return 'warning'
  return 'normal'
}

export function buildMrpRequirementRows(input: {
  bomRows?: BomComponentRow[]
  demandRows?: MrpDemandRow[]
  stockRows?: MrpStockRow[]
} = {}): MrpRequirementRow[] {
  const bomRows = input.bomRows || []
  const activeDemands = (input.demandRows || []).filter((row) => demandStatusActive(row.status))
  const stockMap = new Map<string, MrpStockRow>()

  for (const row of input.stockRows || []) {
    const key = materialKeyFromStock(row)
    const current = stockMap.get(key)
    if (!current) {
      stockMap.set(key, row)
      continue
    }
    stockMap.set(key, {
      ...current,
      availableQty: toMrpNumber(current.availableQty ?? current.qty) + toMrpNumber(row.availableQty ?? row.qty),
      incomingQty: toMrpNumber(current.incomingQty) + toMrpNumber(row.incomingQty),
      safetyStock: Math.max(toMrpNumber(current.safetyStock ?? current.safeStock), toMrpNumber(row.safetyStock ?? row.safeStock)),
    })
  }

  const result = new Map<string, MrpRequirementRow>()
  for (const demand of activeDemands) {
    const productId = normalizeMrpId(demand.productId)
    const demandQty = roundMrpQty(demand.demandQty ?? demand.planQty ?? demand.qty)
    if (!productId || demandQty <= 0) continue

    const components = bomRows.filter((row) => normalizeMrpId(row.parentProductId ?? row.productId) === productId)
    for (const component of components) {
      const materialKey = materialKeyFromBom(component)
      const usageQty = toMrpNumber(component.qtyPerParent ?? component.qtyPer ?? component.usageQty)
      if (usageQty <= 0) continue

      const lossRate = normalizeRate(component.lossRate ?? component.scrapRate)
      const grossQty = roundMrpQty(demandQty * usageQty)
      const requiredQty = roundMrpQty(grossQty * (1 + lossRate))
      const lossQty = roundMrpQty(requiredQty - grossQty)
      const existing = result.get(materialKey)
      const materialId = normalizeMrpId(component.materialId)
      const source: MrpRequirementSource = {
        orderNo: normalizeText(demand.orderNo, `#${normalizeMrpId(demand.orderId) || '-'}`),
        productName: normalizeText(demand.productName || component.productName || demand.productCode),
        dueDate: normalizeText(demand.dueDate || demand.deliveryDate, '-'),
        qty: demandQty,
        requiredQty,
      }

      if (existing) {
        existing.grossQty = roundMrpQty(existing.grossQty + grossQty)
        existing.lossQty = roundMrpQty(existing.lossQty + lossQty)
        existing.requiredQty = roundMrpQty(existing.requiredQty + requiredQty)
        existing.sourceOrders.push(source)
      } else {
        const stock = (stockMap.get(materialKey) || {}) as MrpStockRow
        const qty = toMrpNumber(stock.qty)
        const lockedQty = toMrpNumber(stock.lockedQty)
        const availableQty = stock.availableQty === undefined || stock.availableQty === null
          ? Math.max(qty - lockedQty, 0)
          : Math.max(toMrpNumber(stock.availableQty), 0)
        result.set(materialKey, {
          materialId,
          materialCode: normalizeText(component.materialCode || stock.materialCode || stock.productCode, materialId ? `M-${materialId}` : materialKey),
          materialName: normalizeText(component.materialName || component.materialCode || stock.materialCode || stock.productCode),
          unit: normalizeText(component.unit, ''),
          grossQty,
          lossQty,
          requiredQty,
          availableQty: roundMrpQty(availableQty),
          incomingQty: roundMrpQty(stock.incomingQty),
          safetyStock: roundMrpQty(stock.safetyStock ?? stock.safeStock),
          netRequiredQty: 0,
          shortageQty: 0,
          coverageRate: 0,
          riskLevel: 'normal',
          sourceOrders: [source],
        })
      }
    }
  }

  return Array.from(result.values())
    .map((row) => {
      const netRequiredQty = roundMrpQty(Math.max(row.requiredQty + row.safetyStock - row.availableQty - row.incomingQty, 0))
      const shortageQty = netRequiredQty
      const coverageRate = row.requiredQty <= 0
        ? 100
        : Number(Math.min(((row.availableQty + row.incomingQty - row.safetyStock) / row.requiredQty) * 100, 999).toFixed(1))
      return {
        ...row,
        netRequiredQty,
        shortageQty,
        coverageRate,
        riskLevel: requirementRisk(shortageQty, coverageRate),
        sourceOrders: row.sourceOrders.sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.orderNo.localeCompare(right.orderNo)),
      }
    })
    .sort((left, right) => {
      const rank = { danger: 0, warning: 1, normal: 2 }
      return rank[left.riskLevel] - rank[right.riskLevel] || right.shortageQty - left.shortageQty || left.materialCode.localeCompare(right.materialCode)
    })
}

export function summarizeMrpRequirements(rows: MrpRequirementRow[]): MrpSummary {
  const topShortages = rows
    .filter((row) => row.shortageQty > 0)
    .sort((left, right) => right.shortageQty - left.shortageQty)
    .slice(0, 5)

  return rows.reduce(
    (summary, row) => {
      summary.materialCount += 1
      if (row.riskLevel === 'danger') summary.shortageCount += 1
      if (row.riskLevel === 'warning') summary.warningCount += 1
      summary.totalRequiredQty = roundMrpQty(summary.totalRequiredQty + row.requiredQty)
      summary.totalShortageQty = roundMrpQty(summary.totalShortageQty + row.shortageQty)
      return summary
    },
    { materialCount: 0, shortageCount: 0, warningCount: 0, totalRequiredQty: 0, totalShortageQty: 0, topShortages } as MrpSummary,
  )
}
