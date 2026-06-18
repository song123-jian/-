import request from './index'

// 获取库存列表
export const getStockList = (params: any) => request.get('/stock', { params })
// 获取库存台账
export const getStockLedger = (params: any) => request.get('/stock/ledger', { params })
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
export const stockInventory = (data: any) => request.post('/stock-inventories', data)
