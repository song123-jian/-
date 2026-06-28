import request from './index'

export interface ProdReportListParams {
  page?: number
  pageSize?: number
  keyword?: string
  reportType?: string
  shift?: string
  startDate?: string
  endDate?: string
}

export interface ProdReportForm {
  prodOrderId: number | null
  machineId: number | null
  moldId?: number | null
  reportType: string
  shift: string
  qty: number
  badQty?: number
  shots?: number
  startTime?: string
  endTime?: string
}

// 获取报工记录列表
export const getProdReportList = (params: ProdReportListParams) => request.get('/prod-reports', { params })
// 创建报工记录
export const createProdReport = (data: ProdReportForm) => request.post('/prod-reports', data)
// 更新报工记录
export const updateProdReport = (id: number, data: ProdReportForm) => request.put(`/prod-reports/${id}`, data)
// 删除报工记录
export const deleteProdReport = (id: number) => request.delete(`/prod-reports/${id}`)
