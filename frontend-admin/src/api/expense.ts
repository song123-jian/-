import request from './index'

// 获取费用列表
export const getExpenseList = (params: any) => request.get('/expenses', { params })
// 创建费用
export const createExpense = (data: any) => request.post('/expenses', data)
// 更新费用
export const updateExpense = (id: number, data: any) => request.put(`/expenses/${id}`, data)
// 删除费用
export const deleteExpense = (id: number) => request.delete(`/expenses/${id}`)
