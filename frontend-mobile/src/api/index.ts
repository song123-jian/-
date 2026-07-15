import { showToast } from 'vant'
import router from '../router'
import { createSupabaseRequest } from './supabaseRequest'
import { clearStoredAuthContext } from '../utils/auth-session.ts'

let redirectingToLogin = false

const request = createSupabaseRequest({
  onError(message) {
    showToast(message)
  },
  onUnauthorized() {
    if (redirectingToLogin) return
    redirectingToLogin = true
    clearStoredAuthContext()
    router.push('/m/login')
  },
})

export default request
