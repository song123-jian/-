import axios from 'axios'
import { getStoredToken } from '@/utils/auth-storage'

const rawRequest = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

rawRequest.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function importData(type: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return rawRequest.post(`/import/${type}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export async function exportData(type: string, fileName: string) {
  const response = await rawRequest.get(`/export/${type}`, { responseType: 'blob' })
  const blob = response.data as Blob
  const url = window.URL.createObjectURL(blob as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
