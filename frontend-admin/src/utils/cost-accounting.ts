export type CostRiskLevel = 'normal' | 'warning' | 'danger'

export type CostMaterialLine = {
  materialCode?: string | null
  materialName?: string | null
  qty?: number | string | null
  unitPrice?: number | string | null
  lossRate?: number | string | null
}

export type CostLaborLine = {
  processName?: string | null
  hours?: number | string | null
  hourlyRate?: number | string | null
  qty?: number | string | null
  pieceRate?: number | string | null
}

export type CostExpenseLine = {
  expenseName?: string | null
  amount?: number | string | null
  allocationRate?: number | string | null
}

export type ProductCostInput = {
  productCode?: string | null
  productName?: string | null
  outputQty?: number | string | null
  materials?: CostMaterialLine[]
  labors?: CostLaborLine[]
  expenses?: CostExpenseLine[]
  referenceUnitPrice?: number | string | null
}

export type ProductCostResult = {
  productCode: string
  productName: string
  outputQty: number
  materialCost: number
  laborCost: number
  expenseCost: number
  totalCost: number
  unitCost: number
  referenceUnitPrice: number
  grossMarginRate: number
  riskLevel: CostRiskLevel
}

function toCostNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundMoney(value: unknown) {
  return Number(toCostNumber(value).toFixed(2))
}

function normalizeRate(value: unknown) {
  const text = String(value ?? '').trim()
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1))
    return Number.isFinite(percent) && percent > 0 ? percent / 100 : 0
  }
  const num = toCostNumber(value)
  if (num <= 0) return 0
  return num > 1 ? num / 100 : num
}

function normalizeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function calcMaterialLineCost(line: CostMaterialLine) {
  const qty = Math.max(toCostNumber(line.qty), 0)
  const unitPrice = Math.max(toCostNumber(line.unitPrice), 0)
  return roundMoney(qty * unitPrice * (1 + normalizeRate(line.lossRate)))
}

export function calcLaborLineCost(line: CostLaborLine) {
  const hourlyCost = Math.max(toCostNumber(line.hours), 0) * Math.max(toCostNumber(line.hourlyRate), 0)
  const pieceCost = Math.max(toCostNumber(line.qty), 0) * Math.max(toCostNumber(line.pieceRate), 0)
  return roundMoney(hourlyCost + pieceCost)
}

export function calcExpenseLineCost(line: CostExpenseLine) {
  const amount = Math.max(toCostNumber(line.amount), 0)
  const allocationRate = line.allocationRate === undefined || line.allocationRate === null || line.allocationRate === ''
    ? 1
    : normalizeRate(line.allocationRate)
  return roundMoney(amount * allocationRate)
}

function costRisk(unitCost: number, referenceUnitPrice: number): CostRiskLevel {
  if (referenceUnitPrice <= 0) return 'normal'
  if (unitCost >= referenceUnitPrice) return 'danger'
  if (unitCost >= referenceUnitPrice * 0.85) return 'warning'
  return 'normal'
}

export function buildProductCostResult(input: ProductCostInput = {}): ProductCostResult {
  const outputQty = Math.max(toCostNumber(input.outputQty), 0)
  const materialCost = roundMoney((input.materials || []).reduce((sum, line) => sum + calcMaterialLineCost(line), 0))
  const laborCost = roundMoney((input.labors || []).reduce((sum, line) => sum + calcLaborLineCost(line), 0))
  const expenseCost = roundMoney((input.expenses || []).reduce((sum, line) => sum + calcExpenseLineCost(line), 0))
  const totalCost = roundMoney(materialCost + laborCost + expenseCost)
  const unitCost = outputQty > 0 ? roundMoney(totalCost / outputQty) : 0
  const referenceUnitPrice = roundMoney(input.referenceUnitPrice)
  const grossMarginRate = referenceUnitPrice > 0
    ? Number((((referenceUnitPrice - unitCost) / referenceUnitPrice) * 100).toFixed(1))
    : 0

  return {
    productCode: normalizeText(input.productCode),
    productName: normalizeText(input.productName || input.productCode),
    outputQty,
    materialCost,
    laborCost,
    expenseCost,
    totalCost,
    unitCost,
    referenceUnitPrice,
    grossMarginRate,
    riskLevel: costRisk(unitCost, referenceUnitPrice),
  }
}

export function summarizeProductCosts(rows: ProductCostResult[]) {
  return rows.reduce(
    (summary, row) => {
      summary.productCount += 1
      summary.totalCost = roundMoney(summary.totalCost + row.totalCost)
      summary.materialCost = roundMoney(summary.materialCost + row.materialCost)
      summary.laborCost = roundMoney(summary.laborCost + row.laborCost)
      summary.expenseCost = roundMoney(summary.expenseCost + row.expenseCost)
      if (row.riskLevel === 'danger') summary.dangerCount += 1
      if (row.riskLevel === 'warning') summary.warningCount += 1
      return summary
    },
    { productCount: 0, totalCost: 0, materialCost: 0, laborCost: 0, expenseCost: 0, warningCount: 0, dangerCount: 0 },
  )
}
