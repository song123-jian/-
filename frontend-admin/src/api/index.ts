import { ElMessage } from 'element-plus'
import { clearStoredToken } from '@/utils/auth-storage'
import { createSupabaseRequest } from './supabaseRequest'

const request = createSupabaseRequest({
  onError(message) {
    ElMessage.error(message)
  },
  onUnauthorized() {
    clearStoredToken()
    window.location.href = '/login'
  },
})

export default request
