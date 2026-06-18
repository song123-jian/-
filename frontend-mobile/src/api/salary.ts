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
export function getSalarySummary(params?: { year?: number; month?: number }) {
  return request.get('/salary/summary', { params })
}

/** 获取日工资明细列表 */
export function getDailySalaryDetails(params: { year: number; month: number }) {
  return request.get('/salary/daily-details', { params })
}
