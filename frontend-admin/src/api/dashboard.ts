import request from './index'

// 获取看板数据
export const getDashboardData = () => request.get('/dashboard')
// 获取老板驾驶舱数据
export const getBossDashboard = () => request.get('/dashboard/boss')
// 获取生产看板数据
export const getProductionBoard = () => request.get('/dashboard/production')
// 获取品质看板数据
export const getQualityBoard = () => request.get('/dashboard/quality')
