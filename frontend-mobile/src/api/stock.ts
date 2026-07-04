import request from './index'

/** 库存记录 */
export interface StockItem {
  id: number
  productId: number
  warehouseName: string
  warehouseId: number
  locationCode: string
  locationId: number
  productCode: string
  productName: string
  batchId?: number
  batchNo?: string
  supplierId?: number | null
  supplierCode?: string
  supplierName?: string
  quantity: number
  qty?: number
  lockedQty?: number
  availableQty?: number
  unit: string
  updateTime: string
}

/** 盘点参数 */
export interface InventoryCheckParams {
  warehouseId: number
  locationId: number
  productId: number
  actualQuantity: number
  reason?: string
}

/** 调拨确认参数 */
export interface TransferConfirmParams {
  transferId: number
}

/** 查询库存 */
export function getStockList(params: {
  keyword?: string
  warehouseId?: number
  locationId?: number
  productCode?: string
}) {
  return request.get('/stock', { params })
}

/** 获取仓库列表 */
export function getWarehouses() {
  return request.get('/warehouses', { params: { page: 1, size: 200 } })
}

/** 获取库位列表 */
export function getLocations(warehouseId?: number) {
  return request.get('/warehouse-locations', { params: { warehouseId, page: 1, size: 200 } })
}

/** 提交盘点 */
export function submitInventoryCheck(data: InventoryCheckParams) {
  return request.post('/stock-inventories/mobile-check', data)
}

/** 确认调拨 */
export function confirmTransfer(data: TransferConfirmParams) {
  return request.put(`/stock-transfers/${data.transferId}/receive`)
}

/** 获取待调拨列表 */
export function getPendingTransfers() {
  return request.get('/stock-transfers', { params: { page: 1, size: 50, status: 'SHIPPED' } })
}

/** 扫码获取调拨信息 */
export function getTransferByCode(code: string) {
  return request.get('/stock-transfers', { params: { keyword: code, page: 1, size: 20 } })
}
