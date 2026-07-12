<template>
  <div class="login-page">
    <main class="login-panel">
      <header class="login-header">
        <h1>注塑厂管理系统</h1>
        <p>移动端登录</p>
      </header>

      <van-notice-bar
        v-if="!isSupabaseConfigured"
        class="login-notice"
        left-icon="warning-o"
        :scrollable="false"
        wrapable
      >
        当前未配置 Supabase 环境变量，请先在 .env.local 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。
      </van-notice-bar>

      <van-notice-bar
        v-else-if="errorMessage"
        class="login-notice"
        left-icon="warning-o"
        :scrollable="false"
        wrapable
      >
        {{ errorMessage }}
      </van-notice-bar>

      <van-form @submit="onSubmit" class="login-form">
        <van-cell-group inset>
          <van-field
            v-model.trim="form.username"
            name="username"
            label="用户名"
            placeholder="请输入用户名"
            type="text"
            inputmode="text"
            maxlength="64"
            clearable
            :rules="[{ required: true, message: '请输入用户名' }]"
          />
          <van-field
            v-model="form.password"
            name="password"
            label="密码"
            placeholder="请输入密码"
            type="password"
            clearable
            :rules="[{ required: true, message: '请输入密码' }]"
          />
        </van-cell-group>

        <div class="login-btn-wrap">
          <van-button round block type="primary" native-type="submit" :loading="loading" :disabled="!isSupabaseConfigured">
            登录
          </van-button>
        </div>
      </van-form>

      <div class="login-status">
        <van-tag :type="isSupabaseConfigured ? 'success' : 'warning'" plain>
          {{ isSupabaseConfigured ? 'Supabase 已配置' : 'Supabase 未配置' }}
        </van-tag>
        <span>{{ isSupabaseConfigured ? '可直接登录' : '补齐环境变量后再登录' }}</span>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { isSupabaseConfigured } from '../../api/supabaseClient'
import { useUserStore } from '../../store/user'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const errorMessage = ref('')
const form = reactive({
  username: '',
  password: '',
})

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

async function onSubmit() {
  errorMessage.value = ''
  if (!isSupabaseConfigured) {
    errorMessage.value = '请先在 .env.local 中配置 Supabase 环境变量'
    return
  }

  loading.value = true
  try {
    await userStore.doLogin({
      username: form.username,
      password: form.password,
    })
    showToast('登录成功')
    router.replace('/m/home')
  } catch (err) {
    errorMessage.value = normalizeLoginError(err)
    showToast(errorMessage.value)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  padding: 24px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.login-panel {
  width: min(100%, 420px);
  padding: 24px 18px 20px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.login-header {
  text-align: center;
  color: #111827;
  margin-bottom: 18px;

  h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.2;
    font-weight: 700;
  }

  p {
    margin: 8px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: #6b7280;
  }
}

.login-notice {
  margin-bottom: 14px;
  border-radius: 8px;
}

.login-form {
  :deep(.van-cell-group--inset) {
    margin: 0;
    border-radius: 8px;
    overflow: hidden;
  }

  :deep(.van-field__label) {
    width: 56px;
  }
}

.login-btn-wrap {
  margin: 18px 0 0;
}

.login-status {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}
</style>
