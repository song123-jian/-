import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'

// 创建 axios 实例
const service: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 请求拦截器：自动添加 Token
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：统一处理错误
service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    // 根据后端约定的状态码判断请求是否成功
    if (res.code && res.code !== 200) {
      ElMessage.error(res.message || '请求失败')
      // Token 过期或无效
      if (res.code === 401) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res
  },
  (error) => {
    const status = error.response?.status
    const messages: Record<number, string> = {
      400: '请求参数错误',
      401: '未授权，请重新登录',
      403: '拒绝访问',
      404: '请求资源不存在',
      500: '服务器内部错误，请检查后端服务是否正常',
      502: '网关错误，后端服务未启动',
      503: '服务不可用',
    }
    const message = messages[status] || `请求失败：${error.message}`
    ElMessage.error(message)
    // 401 跳转登录
    if (status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default service
