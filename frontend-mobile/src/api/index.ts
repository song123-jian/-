import axios from 'axios'
import { showToast } from 'vant'
import router from '../router'

// 创建 axios 实例
const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：自动携带 token
request.interceptors.request.use(
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
request.interceptors.response.use(
  (response) => {
    const { data } = response
    // 业务错误码处理
    if (data.code && data.code !== 0 && data.code !== 200) {
      showToast(data.message || '请求失败')
      return Promise.reject(new Error(data.message || '请求失败'))
    }
    return data
  },
  (error) => {
    if (error.response) {
      const { status } = error.response
      if (status === 401) {
        // 未授权，跳转登录页
        localStorage.removeItem('token')
        router.push('/m/login')
        showToast('登录已过期，请重新登录')
      } else if (status === 403) {
        showToast('无权限访问')
      } else if (status === 500) {
        showToast('服务器错误')
      } else {
        showToast('请求失败')
      }
    } else {
      showToast('网络异常，请检查网络连接')
    }
    return Promise.reject(error)
  }
)

export default request
