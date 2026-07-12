import request from './index'

// 用户登录
export const login = (data: any) => request.post('/auth/login', data, { notifyOnError: false })
// 刷新 Token
export const refreshToken = (data: any) => request.post('/auth/refresh', data)
// 用户登出
export const logout = () => request.post('/auth/logout')
// 获取当前用户信息
export const getUserInfo = () => request.get('/auth/userinfo')
