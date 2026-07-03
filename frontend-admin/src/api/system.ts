import request from './index'

// 获取操作日志列表
export const getLogList = (params: any) => request.get('/system/logs', { params })

// 获取系统配置
export const getSystemConfig = () => request.get('/system/config')

// 更新系统配置
export const updateSystemConfig = (data: any) => request.put('/system/config', data)
