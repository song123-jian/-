<template>
  <div class="login-page">
    <main class="login-shell">
      <section class="login-brand" aria-label="系统概览">
        <div class="brand-head">
          <div class="brand-mark">注</div>
          <div class="brand-title-wrap">
            <p class="brand-kicker">云库质量追溯管理端</p>
            <h1 class="brand-title">注塑厂管理系统</h1>
          </div>
        </div>

        <p class="brand-copy">
          围绕订单、生产、质量、设备、工资和云库运维建立统一入口，支撑管理端上线前的稳定交付。
        </p>

        <div class="login-system-grid">
          <div v-for="item in systemTiles" :key="item.title" class="system-tile">
            <span class="tile-label">{{ item.label }}</span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.desc }}</small>
          </div>
        </div>

        <div class="brand-footer">
          <span class="status-dot" :class="{ 'is-warning': !isSupabaseConfigured }"></span>
          <span>{{ isSupabaseConfigured ? 'Supabase 云库已配置' : '等待 Supabase 环境配置' }}</span>
        </div>
      </section>

      <section class="login-card" aria-label="登录表单">
        <header class="login-header">
          <p class="login-kicker">管理员登录</p>
          <h2 class="login-title">进入管理端</h2>
          <p class="login-subtitle">使用已授权账号访问业务页面和运维工具</p>
        </header>

        <el-alert
          v-if="!isSupabaseConfigured"
          class="login-alert"
          type="warning"
          show-icon
          :closable="false"
          title="当前未配置 Supabase 环境变量"
          description="可以点击下方“填写配置”，也可以在 frontend-admin/.env.local 中填写变量后重启前端。"
        />

        <div class="config-entry">
          <div>
            <strong>{{ isSupabaseConfigured ? 'Supabase 已配置' : '还没有 Supabase 配置？' }}</strong>
            <span>{{ isSupabaseConfigured ? '可在这里修改连接参数' : '在页面填写后保存即可生效' }}</span>
          </div>
          <el-button type="primary" plain :icon="Setting" @click="openConfigDialog">
            {{ isSupabaseConfigured ? '修改配置' : '填写配置' }}
          </el-button>
        </div>

        <el-alert
          v-if="authError"
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
              :icon="User"
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
            {{ isSupabaseConfigured ? 'Supabase 已配置' : 'Supabase 未配置' }}
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

    <el-dialog
      v-model="configDialogVisible"
      class="supabase-config-dialog"
      title="Supabase 连接配置"
      top="4vh"
      width="min(560px, calc(100vw - 24px))"
      :close-on-click-modal="false"
      @open="loadConfigForm"
    >
      <el-alert
        class="config-dialog-alert"
        type="info"
        show-icon
        :closable="false"
        title="请使用 Supabase 项目设置中的 anon/public key"
        description="部署默认配置会随程序在不同设备生效；本页修改只覆盖当前设备，且仅允许受信任项目的 publishable key。"
      />
      <el-form ref="configFormRef" :model="configForm" :rules="configRules" label-position="top" class="config-form">
        <el-form-item label="项目 URL" prop="url">
          <el-input v-model.trim="configForm.url" placeholder="https://your-project.supabase.co" autocomplete="url" />
        </el-form-item>
        <el-form-item label="Anon / Public Key" prop="anonKey">
          <el-input
            v-model="configForm.anonKey"
            type="password"
            show-password
            placeholder="粘贴 anon public key"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="登录邮箱域名（可选）" prop="authEmailDomain">
          <el-input v-model.trim="configForm.authEmailDomain" placeholder="your-project-ref.supabase.co" />
        </el-form-item>
        <el-form-item label="存储桶名称（可选）" prop="storageBucket">
          <el-input v-model.trim="configForm.storageBucket" placeholder="erp-files" />
        </el-form-item>
        <el-form-item label="配置确认密码" prop="confirmationPassword">
          <el-input
            v-model="configForm.confirmationPassword"
            type="password"
            show-password
            placeholder="请输入配置确认密码"
            name="supabase-config-confirmation-password"
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="config-dialog-footer">
          <el-button @click="configDialogVisible = false">取消</el-button>
          <el-button
            type="warning"
            plain
            :loading="configResetting"
            :disabled="configSaving"
            @click="handleResetConfig"
          >
            恢复部署默认
          </el-button>
          <el-button
            type="primary"
            :loading="configSaving"
            :disabled="configResetting"
            @click="handleSaveConfig"
          >
            保存并刷新
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, Setting, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  clearSupabaseRuntimeConfig,
  getSupabaseRuntimeConfig,
  isSupabaseConfigured,
  saveSupabaseRuntimeConfig,
  type SupabaseRuntimeConfig,
} from '@/api/supabaseClient'
import { useUserStore } from '@/store/user'
import { resolvePostLoginPath } from '@/utils/auth-route'
import { getErrorMessage } from '@/utils/error-message'

const userStore = useUserStore()
const loginFormRef = ref<FormInstance>()
const loading = ref(false)
const authError = ref('')
const configSaving = ref(false)
const configResetting = ref(false)
const configDialogVisible = ref(false)
const configFormRef = ref<FormInstance>()
const redirectQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : null
const redirectPath = redirectQuery ? resolvePostLoginPath(redirectQuery) : ''

const systemTiles = [
  { label: '质量', title: '过程追溯', desc: '检验、异常、闭环证据统一归档' },
  { label: '现场', title: '生产执行', desc: '派工、报工、设备状态集中呈现' },
  { label: '经营', title: '销售采购', desc: '订单、交付、应收应付贯通' },
  { label: '运维', title: '云库保障', desc: '备份恢复、权限和清理集中管理' },
] as const

const loginForm = reactive({
  username: '',
  password: '',
})

const loginRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const configForm = reactive<SupabaseRuntimeConfig & { confirmationPassword: string }>({
  url: '',
  anonKey: '',
  authEmailDomain: '',
  storageBucket: '',
  confirmationPassword: '',
})

const configRules: FormRules = {
  url: [
    { required: true, message: '请输入 Supabase 项目 URL', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          const parsedUrl = new URL(String(value || '').trim())
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error()
          callback()
        } catch {
          callback(new Error('请输入有效的 http 或 https 地址'))
        }
      },
      trigger: 'blur',
    },
  ],
  anonKey: [{ required: true, message: '请输入 anon/public key', trigger: 'blur' }],
  confirmationPassword: [{ required: true, message: '请输入配置确认密码', trigger: 'blur' }],
}

function loadConfigForm() {
  Object.assign(configForm, getSupabaseRuntimeConfig(), { confirmationPassword: '' })
}

function openConfigDialog() {
  loadConfigForm()
  configDialogVisible.value = true
}

async function handleSaveConfig() {
  const valid = await configFormRef.value?.validate().catch(() => false)
  if (!valid) return

  configSaving.value = true
  try {
    await saveSupabaseRuntimeConfig(configForm, configForm.confirmationPassword)
    ElMessage.success('Supabase 配置已保存，页面即将刷新')
    window.setTimeout(() => window.location.reload(), 300)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Supabase 配置保存失败')
  } finally {
    configSaving.value = false
  }
}

async function handleResetConfig() {
  if (!configForm.confirmationPassword) {
    await configFormRef.value?.validateField('confirmationPassword').catch(() => undefined)
    return
  }

  configResetting.value = true
  try {
    await clearSupabaseRuntimeConfig(configForm.confirmationPassword)
    ElMessage.success('已恢复部署默认 Supabase 配置，页面即将刷新')
    window.setTimeout(() => window.location.reload(), 300)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Supabase 配置恢复失败')
  } finally {
    configResetting.value = false
  }
}

onMounted(() => {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('configure') === '1') {
    openConfigDialog()
  }
})

function normalizeLoginError(error: unknown) {
  const message = getErrorMessage(error, '登录失败，请稍后重试')
  if (message.toLowerCase().includes('current_erp_user_profile') || message.toLowerCase().includes('could not find the function')) {
    return 'Supabase 尚未完成完整初始化，请在全新项目 SQL Editor 执行 database/supabase-cloud.sql'
  }
  if (message.toLowerCase().includes('failed to fetch')) {
    return '登录请求无法连接 Supabase，请检查当前网络和项目 URL'
  }
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
  padding: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(238, 242, 246, 0.92) 42%),
    #eef2f6;
}

.login-shell {
  width: min(100%, 1040px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 24px;
  align-items: stretch;
}

.login-brand,
.login-card {
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius-card);
  box-shadow: var(--ui-shadow-panel);
}

.login-brand {
  min-height: 560px;
  padding: 40px;
  display: flex;
  flex-direction: column;
  background: #172033;
  color: #fff;
  overflow: hidden;
}

.brand-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-mark {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #0f766e;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
}

.brand-title-wrap {
  min-width: 0;
}

.brand-kicker,
.login-kicker {
  margin: 0 0 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.brand-title {
  margin: 0;
  color: #fff;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0;
}

.brand-copy {
  max-width: 580px;
  margin: 34px 0 0;
  color: #d9e2ee;
  font-size: 16px;
  line-height: 1.8;
}

.login-system-grid {
  margin-top: 36px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.system-tile {
  min-height: 118px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid rgba(226, 232, 240, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.tile-label {
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
}

.system-tile strong {
  margin-top: 10px;
  color: #fff;
  font-size: 17px;
  line-height: 24px;
  letter-spacing: 0;
}

.system-tile small {
  margin-top: 8px;
  color: #b8c4d4;
  font-size: 12px;
  line-height: 18px;
}

.brand-footer {
  margin-top: auto;
  padding-top: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cbd5e1;
  font-size: 13px;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.14);

  &.is-warning {
    background: #f59e0b;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14);
  }
}

.login-card {
  padding: 34px 30px 26px;
  background: #fff;
}

.login-header {
  margin-bottom: 22px;
}

.login-title {
  margin: 0;
  color: #111827;
  font-size: 26px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
}

.login-subtitle {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.login-alert {
  margin-bottom: 16px;
}

.config-entry {
  margin-bottom: 18px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid #dbe7f4;
  border-radius: 8px;
  background: #f7fbff;
}

.config-entry > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.config-entry strong {
  color: #1f3b5b;
  font-size: 13px;
  line-height: 20px;
}

.config-entry span {
  color: #6b7b8f;
  font-size: 12px;
  line-height: 18px;
}

.config-dialog-alert {
  margin-bottom: 18px;
}

.config-form {
  :deep(.el-form-item__label) {
    padding-bottom: 5px;
    color: #475569;
    font-weight: 600;
  }
}

.config-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

:global(.supabase-config-dialog.el-dialog) {
  max-height: 92vh;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:global(.supabase-config-dialog .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}

.login-form {
  :deep(.el-input__wrapper) {
    border-radius: 8px;
  }
}

.login-btn {
  width: 100%;
  min-height: 42px;
}

.login-status {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #64748b;
  font-size: 12px;
}

.login-status-text {
  min-width: 0;
}

.login-redirect {
  margin: 12px 0 0;
  color: #8b95a1;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

@media (max-width: 920px) {
  .login-page {
    align-items: flex-start;
    padding: 20px;
  }

  .login-shell {
    grid-template-columns: 1fr;
  }

  .login-brand {
    min-height: 0;
    padding: 28px;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 12px;
  }

  .login-brand,
  .login-card {
    padding: 20px;
  }

  .brand-head {
    align-items: flex-start;
  }

  .brand-title {
    font-size: 24px;
  }

  .brand-copy {
    margin-top: 22px;
    font-size: 14px;
  }

  .login-system-grid {
    grid-template-columns: 1fr;
    margin-top: 22px;
  }

  .login-title {
    font-size: 23px;
  }

  .login-status {
    align-items: flex-start;
    flex-direction: column;
  }

  .config-entry {
    align-items: flex-start;
    flex-direction: column;
  }

  .config-entry .el-button {
    width: 100%;
  }
}
</style>
