import request from './index'

/** 通知消息 */
export interface Notification {
  id: number
  title: string
  content: string
  type: string
  isRead: boolean
  createTime: string
}

/** 获取通知列表 */
export function getNotifications(params: { page: number; pageSize: number }) {
  return request.get('/notification/list', { params })
}

/** 标记通知已读 */
export function markAsRead(id: number) {
  return request.post(`/notification/read/${id}`)
}

/** 标记全部已读 */
export function markAllAsRead() {
  return request.post('/notification/read-all')
}

/** 获取未读数量 */
export function getUnreadCount() {
  return request.get('/notification/unread-count')
}
