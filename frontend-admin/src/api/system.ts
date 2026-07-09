import request from './index'
import type { SystemConfigPayload } from '@/utils/system-config'

// 获取操作日志列表
export const getLogList = (params: any) => request.get('/system/logs', { params })

// 写入操作日志
export const createOperationLog = (data: any) => request.post('/system/logs', data)

// 获取系统配置
export const getSystemConfig = () => request.get('/system/config')

// 更新系统配置
export const updateSystemConfig = (data: SystemConfigPayload) => request.put('/system/config', data)

// 一键清除业务数据，保留登录账号与系统配置
export const clearAllBusinessData = (data: { confirmText: string }) => request.post('/system/clear-business-data', data)
