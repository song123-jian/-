import request from './index'

/** 报工参数 */
export interface ProdReportParams {
  workOrderId: number
  machineId: number
  processName: string
  shift: string
  quantity: number
  defectCount: number
  moldCount: number
}

/** 报工记录 */
export interface ProdReportRecord {
  id: number
  workOrderId: number
  workOrderNo: string
  productName: string
  machineId: number
  machineCode: string
  processName: string
  shift: string
  quantity: number
  defectCount: number
  moldCount: number
  createdAt: string
  reporterName: string
}

/** 提交报工 */
export function submitReport(data: ProdReportParams) {
  return request.post('/prod-reports', {
    prodOrderId: data.workOrderId,
    machineId: data.machineId,
    reportType: 'OUTPUT',
    processName: data.processName,
    shift: data.shift,
    qty: data.quantity,
    badQty: data.defectCount,
    shots: data.moldCount,
  })
}

/** 获取当班任务列表 */
export function getCurrentShiftTasks() {
  return request.get('/prod-reports/current-shift-tasks')
}

/** 根据机台编号获取工单列表 */
export function getWorkOrdersByMachine(machineCode: string) {
  return request.get('/prod-reports/work-orders', { params: { machineCode } })
}

/** 获取我的报工记录 */
export function getMyReports(params: { type: 'day' | 'month'; date?: string; page?: number; size?: number }) {
  return request.get('/prod-reports/my-reports', { params })
}

/** 获取我的产量统计 */
export function getMyOutputStats(params: { type: 'day' | 'month'; date?: string }) {
  return request.get('/prod-reports/my-output-stats', { params })
}
