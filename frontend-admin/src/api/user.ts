import request from './index'

// 获取用户列表
export const getUserList = (params: any) => request.get('/users', { params })
// 创建用户
export const createUser = (data: any) => request.post('/users', data)
// 更新用户
export const updateUser = (id: number, data: any) => request.put(`/users/${id}`, data)
// 删除用户
export const deleteUser = (id: number) => request.delete(`/users/${id}`)
// 重置密码
export const resetPassword = (id: number, data: { newPassword: string }) => request.put(`/users/${id}/reset-password`, data)
