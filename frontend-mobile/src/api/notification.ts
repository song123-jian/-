import request from './index'

/** 通知消息 */
export interface Notification {
  id: number
  title: string
  content: string
  type: string
  isRead: boolean
  createdAt: string
}

/** 获取通知列表 */
export function getNotifications(params: { page: number; pageSize: number }) {
  return request.get('/notifications', { params })
}

/** 标记通知已读 */
export function markAsRead(id: number) {
  return request.post(`/notifications/read/${id}`)
}

/** 标记全部已读 */
export function markAllAsRead() {
  return request.post('/notifications/read-all')
}

/** 获取未读数量 */
export function getUnreadCount() {
  return request.get('/notifications/unread-count')
}

/** 删除通知 */
export function deleteNotification(id: number) {
  return request.delete(`/notifications/${id}`)
}
