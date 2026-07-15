import { ElMessage } from 'element-plus'
import { clearStoredAuthContext } from '@/utils/auth-storage'
import { createSupabaseRequest } from './supabaseRequest'
import { buildLoginUrl, getCurrentLocationPath } from '@/utils/auth-route'

let redirectingToLogin = false

const request = createSupabaseRequest({
  onError(message) {
    ElMessage.error(message)
  },
  onUnauthorized() {
    if (redirectingToLogin) return
    redirectingToLogin = true
    clearStoredAuthContext()
    window.location.replace(buildLoginUrl(getCurrentLocationPath()))
  },
})

export default request
