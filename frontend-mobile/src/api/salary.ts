import request from './index'

/** 工资汇总 */
export interface SalarySummary {
  year: number
  month: number
  baseSalary: number
  pieceAmount: number
  overtimeAmount: number
  deduction: number
  totalAmount: number
}

export interface SalaryQueryParams {
  year?: number
  month?: number
  userId?: number
}

/** 日工资明细 */
export interface DailySalaryDetail {
  date: string
  workHours: number
  pieceCount: number
  pieceAmount: number
  overtimeHours: number
  overtimeAmount: number
  dailyTotal: number
}

/** 获取当月工资汇总 */
export function getSalarySummary(params?: SalaryQueryParams) {
  return request.get('/salary/summary', { params })
}

/** 获取日工资明细列表 */
export function getDailySalaryDetails(params: { year: number; month: number; userId?: number }) {
  return request.get('/salary/daily-details', { params })
}
