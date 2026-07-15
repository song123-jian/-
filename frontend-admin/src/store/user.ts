import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as loginApi, logout as logoutApi, getUserInfo as getUserInfoApi } from '@/api/auth'
import router from '@/router'
import { clearStoredAuthContext, getStoredToken, setStoredToken } from '@/utils/auth-storage'
import { resolvePostLoginPath } from '@/utils/auth-route'

// 用户状态管理
export const useUserStore = defineStore('user', () => {
  // Token
  const token = ref<string>(getStoredToken())
  // 用户信息
  const userInfo = ref<any>({})
  // 角色列表
  const roles = ref<string[]>([])

  function resolveLoginRedirect() {
    const redirect = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : ''
    return resolvePostLoginPath(redirect)
  }

  // 登录
  async function loginAction(loginForm: { username: string; password: string }) {
    const res: any = await loginApi(loginForm)
    if (!res?.data?.token) {
      throw new Error('登录返回数据异常')
    }
    token.value = res.data.token
    userInfo.value = res.data
    roles.value = res.data.roles || []
    setStoredToken(res.data.token)
    try {
      localStorage.setItem('userId', String(res.data.userId || 0))
      localStorage.setItem('userName', res.data.userName || '')
      localStorage.setItem('realName', res.data.realName || res.data.userName || '')
      localStorage.setItem('phone', res.data.phone || '')
      localStorage.setItem('role', res.data.role || '')
      localStorage.setItem('roles', JSON.stringify(res.data.roles || []))
    } catch {
      // ignore
    }
    // 获取用户信息（容错：失败不阻断登录跳转）
    try {
      await getUserInfoAction()
    } catch {
      // 获取用户信息失败不影响登录
    }
    // 优先回到登录前目标页，便于页面级验证和深链访问
    router.replace(resolveLoginRedirect())
  }

  // 获取用户信息
  async function getUserInfoAction() {
    const res: any = await getUserInfoApi()
    userInfo.value = res.data
    roles.value = res.data.roles || []
  }

  // 登出
  async function logoutAction() {
    try {
      await logoutApi()
    } catch {
      // 忽略登出接口错误
    }
    token.value = ''
    userInfo.value = {}
    roles.value = []
    clearStoredAuthContext()
    router.push('/login')
  }

  return {
    token,
    userInfo,
    roles,
    loginAction,
    getUserInfoAction,
    logoutAction,
  }
})
