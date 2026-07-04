import { ElMessage } from 'element-plus'
import { clearStoredToken } from '@/utils/auth-storage'
import { createSupabaseRequest } from './supabaseRequest'
import { buildLoginUrl, getCurrentLocationPath } from '@/utils/auth-route'

const request = createSupabaseRequest({
  onError(message) {
    ElMessage.error(message)
  },
  onUnauthorized() {
    clearStoredToken()
    window.location.replace(buildLoginUrl(getCurrentLocationPath()))
  },
})

export default request
