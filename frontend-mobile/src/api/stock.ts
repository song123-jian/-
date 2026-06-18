import request from './index'

/** 库存记录 */
export interface StockItem {
  id: number
  warehouseName: string
  locationCode: string
  productCode: string
  productName: string
  quantity: number
  unit: string
  updateTime: string
}

/** 盘点参数 */
export interface InventoryCheckParams {
  locationId: number
  productId: number
  actualQuantity: number
}

/** 调拨确认参数 */
export interface TransferConfirmParams {
  transferId: number
  action: 'receive' | 'reject'
}

/** 查询库存 */
export function getStockList(params: {
  keyword?: string
  warehouseId?: number
  locationId?: number
  productCode?: string
}) {
  return request.get('/stock/list', { params })
}

/** 获取仓库列表 */
export function getWarehouses() {
  return request.get('/stock/warehouses')
}

/** 获取库位列表 */
export function getLocations(warehouseId?: number) {
  return request.get('/stock/locations', { params: { warehouseId } })
}

/** 提交盘点 */
export function submitInventoryCheck(data: InventoryCheckParams) {
  return request.post('/stock/inventory-check', data)
}

/** 确认调拨 */
export function confirmTransfer(data: TransferConfirmParams) {
  return request.post('/stock/transfer-confirm', data)
}

/** 获取待调拨列表 */
export function getPendingTransfers() {
  return request.get('/stock/pending-transfers')
}

/** 扫码获取调拨信息 */
export function getTransferByCode(code: string) {
  return request.get('/stock/transfer-by-code', { params: { code } })
}
