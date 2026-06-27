import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as loginApi, logout as logoutApi, type LoginParams, type LoginResult } from '../api/auth'

/** 用户状态管理 */
export const useUserStore = defineStore('user', () => {
  // 用户信息
  const token = ref<string>(localStorage.getItem('token') || '')
  const userId = ref<number>(Number(localStorage.getItem('userId') || 0))
  const userName = ref<string>(localStorage.getItem('userName') || '')
  const phone = ref<string>(localStorage.getItem('phone') || '')
  const role = ref<string>(localStorage.getItem('role') || '')
  const realName = ref<string>(localStorage.getItem('realName') || '')
  const shift = ref<string>(localStorage.getItem('shift') || '白班')

  /** 是否已登录 */
  const isLoggedIn = () => !!token.value

  /** 登录 */
  async function doLogin(params: LoginParams) {
    const res = await loginApi(params) as any
    const data: LoginResult = res.data || res
    token.value = data.token
    userId.value = data.userId
    userName.value = data.userName
    phone.value = data.phone
    role.value = data.role
    realName.value = (data as any).realName || data.userName
    // 持久化 token
    localStorage.setItem('token', data.token)
    localStorage.setItem('userId', String(data.userId || 0))
    localStorage.setItem('userName', data.userName || '')
    localStorage.setItem('phone', data.phone || '')
    localStorage.setItem('role', data.role || '')
    localStorage.setItem('realName', realName.value || '')
  }

  /** 退出登录 */
  async function doLogout() {
    try {
      await logoutApi()
    } finally {
      // 无论接口是否成功，都清除本地状态
      token.value = ''
      userId.value = 0
      userName.value = ''
      phone.value = ''
      role.value = ''
      realName.value = ''
      shift.value = '白班'
      localStorage.removeItem('token')
      localStorage.removeItem('userId')
      localStorage.removeItem('userName')
      localStorage.removeItem('phone')
      localStorage.removeItem('role')
      localStorage.removeItem('realName')
      localStorage.removeItem('shift')
    }
  }

  /** 设置班次 */
  function setShift(s: string) {
    shift.value = s
    localStorage.setItem('shift', s)
  }

  return {
    token,
    userId,
    userName,
    phone,
    role,
    realName,
    shift,
    isLoggedIn,
    doLogin,
    doLogout,
    setShift,
  }
})
