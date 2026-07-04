import request from './index'

// 获取首页工作台数据
export const getDashboardData = () => request.get('/dashboard/home')
// 获取老板驾驶舱数据
export const getBossDashboard = (params?: Record<string, any>) => request.get('/dashboard/boss', { params })
// 获取生产看板数据
export const getProductionBoard = (params?: Record<string, any>) => request.get('/dashboard/production', { params })
// 获取品质看板数据
export const getQualityBoard = (params?: Record<string, any>) => request.get('/dashboard/quality', { params })
