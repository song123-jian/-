import request from './index'

// 获取库存列表
export const getStockList = (params: any) => request.get('/stock', { params })
// 获取库存台账
export const getStockLedger = (params: any) => request.get('/stock/ledger', { params })
// 获取库存预警
export const getStockWarnings = () => request.get('/stock/warnings')
// 采购入库
export const stockInPurchase = (data: any) => request.post('/stock/in-purchase', data)
// 生产领料出库
export const stockOutPicking = (data: any) => request.post('/stock/out-picking', data)
// 成品入库
export const stockInProduce = (data: any) => request.post('/stock/in-produce', data)
// 销售出库
export const stockOutSale = (data: any) => request.post('/stock/out-sale', data)
// 仓库调拨
export const stockTransfer = (data: any) => request.post('/stock-transfers', data)
// 盘点单
export const createStockInventory = (data: any) => request.post('/stock-inventories', data)
// 盘点单列表
export const getStockInventoryList = (params: any) => request.get('/stock-inventories', { params })
// 开始盘点
export const startStockInventory = (id: number) => request.put(`/stock-inventories/${id}/start`)
// 录入实盘
export const countStockInventory = (id: number, data: any) => request.put(`/stock-inventories/${id}/count`, data)
// 提交审核
export const submitStockInventory = (id: number) => request.put(`/stock-inventories/${id}/submit`)
// 审核通过
export const approveStockInventory = (id: number) => request.put(`/stock-inventories/${id}/approve`)
// 驳回
export const rejectStockInventory = (id: number) => request.put(`/stock-inventories/${id}/reject`)
