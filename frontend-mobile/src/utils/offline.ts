/**
 * 离线报工工具
 * 使用 IndexedDB 存储离线报工数据，联网后自动同步
 */

/** 数据库名称 */
const DB_NAME = 'inject_erp_offline'
/** 数据库版本 */
const DB_VERSION = 1
/** 存储表名称 */
const STORE_NAME = 'offline_reports'

/** 同步状态 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

/** 离线报工记录 */
export interface OfflineReport {
  id?: number
  workOrderId: number
  machineId: number
  shift: string
  quantity: number
  defectCount: number
  moldCount: number
  sync_status: SyncStatus
  created_at: string
  retry_count: number
}

/** 打开数据库 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        })
        // 创建索引，便于按同步状态查询
        store.createIndex('sync_status', 'sync_status', { unique: false })
        store.createIndex('created_at', 'created_at', { unique: false })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/** 保存报工记录到本地 IndexedDB */
export async function saveOfflineReport(
  data: Omit<OfflineReport, 'id' | 'sync_status' | 'created_at' | 'retry_count'>
): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const record: OfflineReport = {
      ...data,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
      retry_count: 0,
    }

    const request = store.add(record)
    request.onsuccess = () => {
      resolve(request.result as number)
    }
    request.onerror = () => {
      reject(request.error)
    }
    tx.oncomplete = () => {
      db.close()
    }
  })
}

/** 获取所有待同步的报工记录 */
export async function getPendingReports(): Promise<OfflineReport[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('sync_status')
    const request = index.getAll('pending')

    request.onsuccess = () => {
      resolve(request.result || [])
    }
    request.onerror = () => {
      reject(request.error)
    }
    tx.oncomplete = () => {
      db.close()
    }
  })
}

/** 更新报工记录的同步状态 */
export async function updateSyncStatus(
  id: number,
  status: SyncStatus
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const record = getRequest.result
      if (record) {
        record.sync_status = status
        if (status === 'failed') {
          record.retry_count = (record.retry_count || 0) + 1
        }
        store.put(record)
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      reject(tx.error)
    }
  })
}

/** 删除已同步的报工记录 */
export async function deleteSyncedReport(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      reject(tx.error)
    }
  })
}

/** 同步离线报工数据到服务器 */
export async function syncOfflineReports(): Promise<{
  success: number
  failed: number
}> {
  const pendingReports = await getPendingReports()
  let success = 0
  let failed = 0

  for (const report of pendingReports) {
    // 超过5次重试的记录标记为失败
    if (report.retry_count >= 5) {
      await updateSyncStatus(report.id!, 'failed')
      failed++
      continue
    }

    try {
      await updateSyncStatus(report.id!, 'syncing')
      // 动态导入避免循环依赖
      const { submitReport } = await import('../api/prodReport')
      await submitReport({
        workOrderId: report.workOrderId,
        machineId: report.machineId,
        shift: report.shift,
        quantity: report.quantity,
        defectCount: report.defectCount,
        moldCount: report.moldCount,
      })
      // 同步成功，删除本地记录
      await deleteSyncedReport(report.id!)
      success++
    } catch {
      // 同步失败，恢复为待同步状态
      await updateSyncStatus(report.id!, 'pending')
      failed++
    }
  }

  return { success, failed }
}

/** 监听网络状态，联网后自动同步 */
export function setupAutoSync(): void {
  // 页面加载时如果有网络，尝试同步
  if (navigator.onLine) {
    syncOfflineReports()
  }

  // 监听网络恢复事件
  window.addEventListener('online', () => {
    syncOfflineReports()
  })
}
