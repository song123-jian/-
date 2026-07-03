<template>
  <div class="page-container cloud-ops-page">
    <PageHeader title="云库运维">
      <el-tag :type="isSupabaseConfigured ? 'success' : 'warning'" effect="plain">
        {{ isSupabaseConfigured ? 'Supabase 已连接' : 'Supabase 未配置' }}
      </el-tag>
      <el-button plain @click="refreshCheck">
        <el-icon><Refresh /></el-icon>
        重新检查
      </el-button>
    </PageHeader>

    <section class="ops-hero">
      <div class="ops-copy">
        <p class="ops-eyebrow">Supabase Cloud Only</p>
        <h3 class="ops-title">本仓库已完全移除本地后端，备份与恢复统一在 Supabase 控制台执行</h3>
        <p class="ops-description">
          当前页面不再提供伪造的“立即备份”或“恢复”按钮，避免误以为仓库内仍有本地服务、磁盘任务或数据库守护进程。
          生产数据、认证、存储和回滚操作都应以 Supabase 云项目为唯一准入点。
        </p>
      </div>
      <div class="ops-summary">
        <div class="ops-summary-item">
          <span class="ops-summary-label">当前架构</span>
          <strong>前端直连 Supabase</strong>
        </div>
        <div class="ops-summary-item">
          <span class="ops-summary-label">最近检查</span>
          <strong>{{ checkedAt }}</strong>
        </div>
      </div>
    </section>

    <section class="ops-grid">
      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">01</span>
          <h4>本地环境核对</h4>
        </div>
        <p>确认两个前端目录都已配置 `.env.local`，且指向同一个 Supabase 云项目。</p>
        <div class="ops-tags">
          <el-tag v-for="item in requiredEnvKeys" :key="item" effect="plain" type="info">{{ item }}</el-tag>
        </div>
      </article>

      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">02</span>
          <h4>数据库初始化脚本</h4>
        </div>
        <p>先执行业务表脚本，再执行云端权限和存储桶脚本，保证前端直连所需对象已全部创建。</p>
        <div class="ops-tags">
          <el-tag effect="plain">database/init.sql</el-tag>
          <el-tag effect="plain">database/supabase-cloud.sql</el-tag>
        </div>
      </article>

      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">03</span>
          <h4>云端备份与回滚入口</h4>
        </div>
        <p>日常备份、时间点恢复、导出和存储核对都在 Supabase 控制台中完成，不再通过仓库页面触发。</p>
        <ul class="ops-list">
          <li v-for="item in consoleEntries" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">04</span>
          <h4>恢复前检查清单</h4>
        </div>
        <p>执行回滚或恢复前，先确认业务窗口、Auth 用户、存储文件和 RLS 规则一致，避免只恢复表数据。</p>
        <ul class="ops-list">
          <li v-for="item in recoveryChecklist" :key="item">{{ item }}</li>
        </ul>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { isSupabaseConfigured } from '@/api/supabaseClient'
import { formatDateTime } from '@/utils'

const requiredEnvKeys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_AUTH_EMAIL_DOMAIN',
  'VITE_SUPABASE_STORAGE_BUCKET',
]

const consoleEntries = [
  'Supabase Console -> Database -> Backups',
  'Supabase Console -> Database -> SQL Editor',
  'Supabase Console -> Authentication -> Users',
  'Supabase Console -> Storage -> Buckets -> erp-files',
]

const recoveryChecklist = [
  '确认恢复时间点与业务停写窗口一致',
  '同步核对 sys_user、Supabase Auth 用户和角色权限',
  '核对 storage 中业务附件是否需要同时回退',
  '恢复后重新验证登录、工作台和核心单据链路',
]

const checkedAt = ref(formatDateTime(new Date()))

function refreshCheck() {
  checkedAt.value = formatDateTime(new Date())
}
</script>

<style scoped lang="scss">
.cloud-ops-page {
  gap: 16px;
}

.ops-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px;
  border: 1px solid #d9e6ff;
  border-radius: 8px;
  background: linear-gradient(180deg, #f5f9ff 0%, #ffffff 100%);
}

.ops-copy {
  min-width: 0;
  flex: 1;
}

.ops-eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #3159b7;
}

.ops-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.35;
  color: #1f2937;
}

.ops-description {
  margin: 12px 0 0;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.7;
  color: #6b7280;
}

.ops-summary {
  width: min(320px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ops-summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
  background: #fff;
}

.ops-summary-label {
  font-size: 12px;
  color: #8b95a1;
}

.ops-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.ops-card {
  padding: 18px;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
}

.ops-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.ops-card-head h4 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.ops-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #eef4ff;
  color: #3159b7;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.ops-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.ops-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.ops-list {
  margin: 14px 0 0;
  padding-left: 18px;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.8;
}

@media (max-width: 992px) {
  .ops-hero {
    flex-direction: column;
  }

  .ops-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ops-hero {
    padding: 18px;
  }

  .ops-title {
    font-size: 20px;
  }
}
</style>
