import request from './index'
import { resolveResourceTable } from './supabaseRequest'

export function importData(type: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post(`/import/${type}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

function csvEscape(value: any) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export async function exportData(type: string, fileName: string) {
  const table = resolveResourceTable(type)
  const response = await request.get(`/${type}`, { params: { page: 1, size: 10000 } })
  const rows = response.data?.records || response.data?.list || []
  const headers = rows.length ? Object.keys(rows[0]) : ['table']
  const body = rows.length
    ? [headers.join(','), ...rows.map((row: any) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n')
    : `table\n${table}\n`
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.replace(/\.[^.]+$/, '.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
