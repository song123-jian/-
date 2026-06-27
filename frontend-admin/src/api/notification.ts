import request from './index'

// 获取消息列表
export const getNotificationList = (params: any) => request.get('/notifications', { params })
// 获取未读数量
export const getUnreadNotificationCount = () => request.get('/notifications/unread-count')
// 标记已读
export const markNotificationRead = (id: number) => request.put(`/notifications/${id}/read`)
