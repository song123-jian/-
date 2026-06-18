import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as loginApi, logout as logoutApi, type LoginParams, type LoginResult } from '../api/auth'

/** 用户状态管理 */
export const useUserStore = defineStore('user', () => {
  // 用户信息
  const token = ref<string>(localStorage.getItem('token') || '')
  const userId = ref<number>(0)
  const userName = ref<string>('')
  const phone = ref<string>('')
  const role = ref<string>('')
  const shift = ref<string>('白班')

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
    // 持久化 token
    localStorage.setItem('token', data.token)
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
      localStorage.removeItem('token')
    }
  }

  /** 设置班次 */
  function setShift(s: string) {
    shift.value = s
  }

  return {
    token,
    userId,
    userName,
    phone,
    role,
    shift,
    isLoggedIn,
    doLogin,
    doLogout,
    setShift,
  }
})
