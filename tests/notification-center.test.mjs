import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBatchReadSummary,
  buildNotificationQuery,
  buildNotificationSummary,
  collectUnreadNotificationIds,
  normalizeNotification,
  normalizeNotificationList,
  normalizeNotificationReadState,
  normalizeUnreadNotificationCount,
  notificationTypeTag,
  notificationTypeText,
} from '../frontend-admin/src/utils/notification-center.ts'

describe('notification normalization', () => {
  it('normalizes backend rows into stable notification records', () => {
    assert.deepEqual(normalizeNotification({
      id: '12',
      title: '  库存预警  ',
      content: '  原料低于安全库存  ',
      type: 'warning',
      is_read: '0',
      created_at: '2026-07-04 09:00:00',
    }), {
      id: 12,
      title: '库存预警',
      content: '原料低于安全库存',
      type: 'WARNING',
      isRead: false,
      createdAt: '2026-07-04 09:00:00',
    })
  })

  it('falls back safely for invalid values without leaking blank UI text', () => {
    assert.deepEqual(normalizeNotification({ id: 'bad', type: 'unknown', isRead: 'maybe' }), {
      id: 0,
      title: '未命名消息',
      content: '-',
      type: 'INFO',
      isRead: false,
      createdAt: '',
    })
  })

  it('normalizes list read states from compatible front-end and database values', () => {
    const rows = normalizeNotificationList([
      { id: 1, isRead: true },
      { id: 2, is_read: 0 },
      { id: 3, is_read: '已读' },
      { id: 4, isRead: 'unread' },
    ])

    assert.deepEqual(rows.map((row) => row.isRead), [true, false, true, false])
  })
})

describe('notification query and summary', () => {
  it('builds bounded service query params for keyword and read state', () => {
    assert.deepEqual(buildNotificationQuery({ page: '0', pageSize: '999', keyword: '  机台  ', readState: '0' }), {
      page: 1,
      pageSize: 200,
      keyword: '机台',
      isRead: 0,
    })
    assert.deepEqual(buildNotificationQuery({ page: 2, pageSize: 50, isRead: '1' }), {
      page: 2,
      pageSize: 50,
      isRead: 1,
    })
    assert.equal(normalizeNotificationReadState('bad'), '')
  })

  it('summarizes visible notifications by read state and severity', () => {
    const rows = normalizeNotificationList([
      { id: 1, type: 'ERROR', isRead: false },
      { id: 2, type: 'WARNING', isRead: false },
      { id: 3, type: 'INFO', isRead: true },
      { id: 4, type: 'bad', isRead: true },
    ])

    assert.deepEqual(buildNotificationSummary(rows), {
      total: 4,
      unread: 2,
      read: 2,
      error: 1,
      warning: 1,
      info: 2,
    })
  })

  it('collects deduplicated readable unread ids only', () => {
    const rows = normalizeNotificationList([
      { id: 1, isRead: false },
      { id: 1, isRead: false },
      { id: 2, isRead: true },
      { id: 0, isRead: false },
    ])

    assert.deepEqual(collectUnreadNotificationIds(rows), [1])
  })
})

describe('notification display and batch result', () => {
  it('maps notification types to labels and tag tones', () => {
    assert.equal(notificationTypeText('ERROR'), '严重')
    assert.equal(notificationTypeTag('ERROR'), 'danger')
    assert.equal(notificationTypeText('warning'), '警告')
    assert.equal(notificationTypeTag('INFO'), 'info')
    assert.equal(notificationTypeText('unknown'), '消息')
  })

  it('builds auditable batch read summaries', () => {
    assert.deepEqual(buildBatchReadSummary(0, 0), { success: 0, failed: 0, state: 'info', message: '当前没有未读消息' })
    assert.deepEqual(buildBatchReadSummary(3, 3), { success: 3, failed: 0, state: 'success', message: '已标记 3 条消息为已读' })
    assert.deepEqual(buildBatchReadSummary(3, 0), { success: 0, failed: 3, state: 'error', message: '3 条消息标记失败' })
    assert.deepEqual(buildBatchReadSummary(3, 2), { success: 2, failed: 1, state: 'warning', message: '已标记 2 条，1 条失败' })
  })

  it('normalizes unread count responses from compatible API shapes', () => {
    assert.equal(normalizeUnreadNotificationCount(3.8), 3)
    assert.equal(normalizeUnreadNotificationCount('5'), 5)
    assert.equal(normalizeUnreadNotificationCount({ unreadCount: 7, count: 2 }), 7)
    assert.equal(normalizeUnreadNotificationCount({ count: 2 }), 2)
    assert.equal(normalizeUnreadNotificationCount({ total: -1 }), 0)
    assert.equal(normalizeUnreadNotificationCount(null), 0)
  })
})
