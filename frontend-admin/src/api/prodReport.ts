import request from './index'

// 获取报工记录列表
export const getProdReportList = (params: any) => request.get('/prod-reports', { params })
// 创建报工记录
export const createProdReport = (data: any) => request.post('/prod-reports', data)
// 更新报工记录
export const updateProdReport = (id: number, data: any) => request.put(`/prod-reports/${id}`, data)
// 删除报工记录
export const deleteProdReport = (id: number) => request.delete(`/prod-reports/${id}`)
