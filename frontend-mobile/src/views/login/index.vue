<template>
  <div class="login-page">
    <div class="login-header">
      <h1>注塑厂管理系统</h1>
      <p>移动端报工平台</p>
    </div>

    <van-form @submit="onSubmit" class="login-form">
      <van-cell-group inset>
        <van-field
          v-model="form.phone"
          name="phone"
          label="手机号"
          placeholder="请输入手机号"
          type="tel"
          maxlength="11"
          :rules="[
            { required: true, message: '请输入手机号' },
            { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
          ]"
        />
        <van-field
          v-model="form.password"
          name="password"
          label="密码"
          placeholder="请输入密码"
          type="password"
          :rules="[{ required: true, message: '请输入密码' }]"
        />
      </van-cell-group>

      <div class="login-btn-wrap">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          登录
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useUserStore } from '../../store/user'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)

const form = reactive({
  phone: '',
  password: '',
})

/** 提交登录 */
async function onSubmit() {
  loading.value = true
  try {
    await userStore.doLogin({
      phone: form.phone,
      password: form.password,
    })
    showToast('登录成功')
    router.replace('/m/home')
  } catch (err: any) {
    showToast(err.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1989fa, #07c160);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 20px;
}

.login-header {
  text-align: center;
  color: #fff;
  margin-bottom: 40px;

  h1 {
    font-size: 28px;
    font-weight: bold;
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    opacity: 0.8;
  }
}

.login-form {
  :deep(.van-cell-group--inset) {
    border-radius: 12px;
    overflow: hidden;
  }
}

.login-btn-wrap {
  margin: 24px 16px 0;
}
</style>
