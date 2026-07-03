import { showToast } from 'vant'
import router from '../router'
import { createSupabaseRequest } from './supabaseRequest'

const request = createSupabaseRequest({
  onError(message) {
    showToast(message)
  },
  onUnauthorized() {
    localStorage.removeItem('token')
    router.push('/m/login')
  },
})

export default request
