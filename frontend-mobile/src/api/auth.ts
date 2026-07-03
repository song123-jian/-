import request from './index'

/** 登录参数 */
export interface LoginParams {
  phone: string
  password: string
}

/** 登录返回结果 */
export interface LoginResult {
  userId: number
  token: string
  userName: string
  realName?: string
  phone: string
  role: string
}

/** 用户登录 */
export function login(data: LoginParams) {
  return request.post<LoginResult>('/auth/login', data)
}

/** 获取当前用户信息 */
export function getUserInfo() {
  return request.get('/auth/user-info')
}

/** 修改密码 */
export function changePassword(data: { oldPassword: string; newPassword: string }) {
  return request.post('/auth/change-password', data)
}

/** 退出登录 */
export function logout() {
  return request.post('/auth/logout')
}
