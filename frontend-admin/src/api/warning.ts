import request from './index'

// 获取预警列表
export const getWarningList = () => request.get('/warnings')
// 获取预警统计
export const getWarningSummary = () => request.get('/warnings/summary')
