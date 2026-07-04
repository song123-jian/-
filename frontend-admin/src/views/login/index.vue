<template>
  <div class="login-page">
    <main class="login-shell">
      <section class="login-panel">
        <header class="login-header">
          <h1 class="login-title">注塑厂管理系统</h1>
          <p class="login-subtitle">Supabase 云端登录</p>
        </header>

        <el-alert
          v-if="!isSupabaseConfigured"
          class="login-alert"
          type="warning"
          show-icon
          :closable="false"
          title="当前未配置 Supabase 环境变量"
          description="请先在 .env.local 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY，然后重新启动前端。"
        />

        <el-alert
          v-else-if="authError"
          class="login-alert"
          type="error"
          show-icon
          :closable="false"
          :title="authError"
        />

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model.trim="loginForm.username"
              placeholder="请输入用户名"
              :prefix-icon="User"
              size="large"
              clearable
              autocomplete="username"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              size="large"
              show-password
              clearable
              autocomplete="current-password"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              native-type="submit"
              :loading="loading"
              :disabled="!isSupabaseConfigured"
              class="login-btn"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>

        <div class="login-status">
          <el-tag :type="isSupabaseConfigured ? 'success' : 'warning'" effect="plain" size="small">
            {{ isSupabaseConfigured ? 'Supabase 已连接' : 'Supabase 未配置' }}
          </el-tag>
          <span class="login-status-text">
            {{ isSupabaseConfigured ? '可直接登录并访问业务页面' : '补齐环境变量后再登录' }}
          </span>
        </div>

        <p v-if="redirectPath" class="login-redirect">
          登录后将返回：{{ redirectPath }}
        </p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { isSupabaseConfigured } from '@/api/supabaseClient'
import { useUserStore } from '@/store/user'
import { resolvePostLoginPath } from '@/utils/auth-route'

const userStore = useUserStore()
const loginFormRef = ref<FormInstance>()
const loading = ref(false)
const authError = ref('')
const redirectQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : null
const redirectPath = redirectQuery ? resolvePostLoginPath(redirectQuery) : ''

const loginForm = reactive({
  username: '',
  password: '',
})

const loginRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function normalizeLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (message.includes('VITE_SUPABASE_URL') || message.includes('VITE_SUPABASE_ANON_KEY')) {
    return '请先在 .env.local 中配置 Supabase 环境变量'
  }
  if (message.toLowerCase().includes('invalid login credentials')) {
    return '用户名或密码错误'
  }
  return message || '登录失败，请稍后重试'
}

async function handleLogin() {
  authError.value = ''
  if (!isSupabaseConfigured) {
    authError.value = '请先在 .env.local 中配置 Supabase 环境变量'
    return
  }

  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await userStore.loginAction(loginForm)
  } catch (error) {
    authError.value = normalizeLoginError(error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.login-shell {
  width: 100%;
  display: flex;
  justify-content: center;
}

.login-panel {
  width: min(100%, 440px);
  padding: 36px 32px 28px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}

.login-header {
  margin-bottom: 20px;
}

.login-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
  color: #111827;
  font-weight: 700;
  text-align: center;
}

.login-subtitle {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: #6b7280;
  text-align: center;
}

.login-alert {
  margin-bottom: 16px;
}

.login-form {
  :deep(.el-input__wrapper) {
    border-radius: 8px;
  }
}

.login-btn {
  width: 100%;
}

.login-status {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12px;
  color: #6b7280;
}

.login-status-text {
  min-width: 0;
}

.login-redirect {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  color: #8b95a1;
  line-height: 1.5;
  word-break: break-all;
}

@media (max-width: 640px) {
  .login-page {
    padding: 16px;
  }

  .login-panel {
    padding: 24px 18px 20px;
  }

  .login-title {
    font-size: 24px;
  }
}
</style>
