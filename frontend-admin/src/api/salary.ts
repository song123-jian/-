import request from './index'

// 获取计件单价列表
export const getSalaryPriceList = (params: any) => request.get('/salary/prices', { params })
// 创建计件单价
export const createSalaryPrice = (data: any) => request.post('/salary/prices', data)
// 更新计件单价
export const updateSalaryPrice = (id: number, data: any) => request.put(`/salary/prices/${id}`, data)
// 删除计件单价
export const deleteSalaryPrice = (id: number) => request.delete(`/salary/prices/${id}`)
// 获取日工资列表
export const getDailySalaryList = (params: any) => request.get('/salary/daily', { params })
// 获取月工资汇总列表
export const getMonthlySalaryList = (params: any) => request.get('/salary/monthly', { params })
// 月工资结算
export const settleMonthlySalary = (data: any) => request.post('/salary/monthly/settle', data)
// 获取奖惩列表
export const getSalaryAdjustList = (params: any) => request.get('/salary/adjust', { params })
// 创建奖惩
export const createSalaryAdjust = (data: any) => request.post('/salary/adjust', data)
// 更新奖惩
export const updateSalaryAdjust = (id: number, data: any) => request.put(`/salary/adjust/${id}`, data)
// 删除奖惩
export const deleteSalaryAdjust = (id: number) => request.delete(`/salary/adjust/${id}`)
