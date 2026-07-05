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
/** 通用离线任务本地存储键 */
const ACTION_TASKS_STORAGE_KEY = 'inject_erp_offline_action_tasks'

/** 同步状态 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

/** 通用离线任务来源 */
export type OfflineActionSource = 'qc' | 'inventory' | 'transfer'

/** 离线报工记录 */
export interface OfflineReport {
  id?: number
  workOrderId: number
  machineId: number
  processName: string
  shift: string
  quantity: number
  defectCount: number
  moldCount: number
  sync_status: SyncStatus
  created_at: string
  retry_count: number
}

/** 质检/盘点/调拨通用离线任务 */
export interface OfflineActionTask {
  id: string
  source: OfflineActionSource
  title: string
  description: string
  payload: Record<string, any>
  sync_status: SyncStatus
  created_at: string
  retry_count: number
  last_error?: string
}

export type OfflineActionTaskInput = {
  source: OfflineActionSource
  title: string
  description: string
  payload: Record<string, any>
  last_error?: string
}

function hasLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function createOfflineActionTaskId(source: OfflineActionSource) {
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readOfflineActionTasks(): OfflineActionTask[] {
  if (!hasLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(ACTION_TASKS_STORAGE_KEY)
    const rows = raw ? JSON.parse(raw) : []
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function writeOfflineActionTasks(rows: OfflineActionTask[]) {
  if (!hasLocalStorage()) return
  window.localStorage.setItem(ACTION_TASKS_STORAGE_KEY, JSON.stringify(rows))
}

function normalizeActionTaskStatus(value?: string): SyncStatus {
  if (value === 'syncing' || value === 'synced' || value === 'failed') return value
  return 'pending'
}

function normalizeOfflineActionTask(row: OfflineActionTask): OfflineActionTask {
  return {
    id: String(row.id || createOfflineActionTaskId(row.source)),
    source: row.source,
    title: String(row.title || '离线任务'),
    description: String(row.description || ''),
    payload: row.payload || {},
    sync_status: normalizeActionTaskStatus(row.sync_status),
    created_at: String(row.created_at || new Date().toISOString()),
    retry_count: Number(row.retry_count || 0),
    last_error: row.last_error,
  }
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
  const reports = await getOfflineReports(['pending'])
  return reports
}

/** 获取离线报工记录，可按状态筛选 */
export async function getOfflineReports(statuses?: SyncStatus[]): Promise<OfflineReport[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const rows = request.result || []
      if (!statuses?.length) {
        resolve(rows)
        return
      }
      resolve(rows.filter((item) => statuses.includes(item.sync_status)))
    }
    request.onerror = () => {
      reject(request.error)
    }
    tx.oncomplete = () => {
      db.close()
    }
  })
}

/** 获取失败或待同步记录，用于移动端离线任务中心 */
export async function getActionableOfflineReports(): Promise<OfflineReport[]> {
  return getOfflineReports(['pending', 'failed', 'syncing'])
}

/** 保存质检/盘点/调拨离线任务 */
export function saveOfflineActionTask(input: OfflineActionTaskInput): OfflineActionTask {
  const task: OfflineActionTask = {
    id: createOfflineActionTaskId(input.source),
    source: input.source,
    title: input.title,
    description: input.description,
    payload: input.payload,
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    retry_count: 0,
    last_error: input.last_error,
  }
  const rows = readOfflineActionTasks().map(normalizeOfflineActionTask)
  rows.push(task)
  writeOfflineActionTasks(rows)
  return task
}

/** 获取通用离线任务，可按状态筛选 */
export function getOfflineActionTasks(statuses?: SyncStatus[]): OfflineActionTask[] {
  const rows = readOfflineActionTasks().map(normalizeOfflineActionTask)
  if (!statuses?.length) return rows
  return rows.filter((item) => statuses.includes(item.sync_status))
}

/** 获取失败、待同步或同步中的通用离线任务 */
export function getActionableOfflineActionTasks(): OfflineActionTask[] {
  return getOfflineActionTasks(['pending', 'failed', 'syncing'])
}

/** 更新通用离线任务状态 */
export function updateOfflineActionTaskStatus(id: string, status: SyncStatus, lastError = '') {
  const rows = readOfflineActionTasks().map((item) => {
    const task = normalizeOfflineActionTask(item)
    if (task.id !== id) return task
    return {
      ...task,
      sync_status: status,
      retry_count: status === 'failed' ? task.retry_count + 1 : task.retry_count,
      last_error: lastError || task.last_error,
    }
  })
  writeOfflineActionTasks(rows)
}

/** 删除已同步通用离线任务 */
export function deleteOfflineActionTask(id: string) {
  writeOfflineActionTasks(readOfflineActionTasks().filter((item) => item.id !== id))
}

/** 将失败通用任务重新放回待同步队列 */
export function retryOfflineActionTask(id: string) {
  updateOfflineActionTaskStatus(id, 'pending')
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

/** 将失败记录重新放回待同步队列 */
export async function retryOfflineReport(id: number): Promise<void> {
  await updateSyncStatus(id, 'pending')
}

async function submitOfflineActionTask(task: OfflineActionTask) {
  if (task.source === 'qc') {
    const { submitQcRecord } = await import('../api/qcRecord')
    await submitQcRecord(task.payload as any)
    return
  }
  if (task.source === 'inventory') {
    const { submitInventoryCheck } = await import('../api/stock')
    await submitInventoryCheck(task.payload as any)
    return
  }
  if (task.source === 'transfer') {
    const { confirmTransfer } = await import('../api/stock')
    await confirmTransfer(task.payload as any)
  }
}

/** 同步质检/盘点/调拨通用离线任务 */
export async function syncOfflineActionTasks(): Promise<{
  success: number
  failed: number
}> {
  const tasks = getOfflineActionTasks(['pending'])
  let success = 0
  let failed = 0

  for (const task of tasks) {
    if (task.retry_count >= 5) {
      updateOfflineActionTaskStatus(task.id, 'failed', task.last_error || '超过最大重试次数')
      failed++
      continue
    }

    try {
      updateOfflineActionTaskStatus(task.id, 'syncing')
      await submitOfflineActionTask(task)
      deleteOfflineActionTask(task.id)
      success++
    } catch (error: any) {
      updateOfflineActionTaskStatus(task.id, 'failed', error?.message || '同步失败')
      failed++
    }
  }

  return { success, failed }
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
        processName: report.processName,
        shift: report.shift,
        quantity: report.quantity,
        defectCount: report.defectCount,
        moldCount: report.moldCount,
      })
      // 同步成功，删除本地记录
      await deleteSyncedReport(report.id!)
      success++
    } catch {
      // 同步失败，记录失败状态并累计重试次数，离线任务中心可继续重试。
      await updateSyncStatus(report.id!, 'failed')
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
    syncOfflineActionTasks()
  }

  // 监听网络恢复事件
  window.addEventListener('online', () => {
    syncOfflineReports()
    syncOfflineActionTasks()
  })

  // 页面回到前台时再补一次同步，避免长时间后台后错过
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      syncOfflineReports()
      syncOfflineActionTasks()
    }
  })
}
