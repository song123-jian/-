import dayjs from 'dayjs'

function parseDateValue(date: string | Date | null | undefined): dayjs.Dayjs {
  if (date === null || date === undefined || date === '') {
    return dayjs('')
  }

  const direct = dayjs(date)
  if (direct.isValid()) {
    return direct
  }

  if (typeof date === 'string') {
    const normalized = dayjs(date.replace(' ', 'T'))
    if (normalized.isValid()) {
      return normalized
    }
  }

  return direct
}

// 格式化日期
export function formatDate(date: string | Date | null | undefined, format = 'YYYY-MM-DD'): string {
  const parsed = parseDateValue(date)
  return parsed.isValid() ? parsed.format(format) : '-'
}

// 格式化日期时间
export function formatDateTime(date: string | Date | null | undefined): string {
  const parsed = parseDateValue(date)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '-'
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
