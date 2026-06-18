import dayjs from 'dayjs'

// 格式化日期
export function formatDate(date: string | Date, format = 'YYYY-MM-DD'): string {
  return dayjs(date).format(format)
}

// 格式化日期时间
export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

// 格式化金额（保留两位小数）
export function formatMoney(value: number): string {
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 表格分页参数
export interface PageParams {
  page: number
  pageSize: number
}

// 表格分页返回
export interface PageResult<T> {
  list: T[]
  total: number
}
