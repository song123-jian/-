import request from './index'

// 获取 OEE 统计
export const getOeeStats = (params?: { machineId?: number; date?: string }) =>
  request.get('/reports/oee', { params })
