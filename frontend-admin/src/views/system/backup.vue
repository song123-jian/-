<template>
  <div class="page-container cloud-ops-page">
    <PageHeader title="云库运维">
      <el-tag :type="tagType(envState.state)" effect="plain">{{ envState.stateText }}</el-tag>
      <el-tag :type="tagType(backupPolicy.state)" effect="plain">{{ backupPolicy.stateText }}</el-tag>
      <el-button plain @click="exportOpsPackage">
        <el-icon><Download /></el-icon>
        导出清单
      </el-button>
      <el-button plain :loading="loading" @click="refreshCheck">
        <el-icon><Refresh /></el-icon>
        重新检查
      </el-button>
    </PageHeader>

    <section class="ops-hero">
      <div class="ops-copy">
        <p class="ops-eyebrow">Supabase Cloud Operations</p>
        <h3 class="ops-title">云数据库备份、恢复和附件核对统一纳入可审计运维流程</h3>
        <p class="ops-description">
          前端不直接触发数据库恢复或删除动作，避免高风险操作绕过 Supabase 控制台、身份验证和审计记录。
          本页聚合环境状态、系统备份策略、恢复检查点和控制台入口，作为恢复演练与上线前核对依据。
        </p>
      </div>
      <div class="ops-summary">
        <div v-for="item in summaryCards" :key="item.label" class="ops-summary-item">
          <span class="ops-summary-label">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.description }}</small>
        </div>
      </div>
    </section>

    <el-alert v-if="envState.state !== 'success'" :title="envState.summary" :type="tagType(envState.state)" show-icon :closable="false" />
    <el-alert v-if="backupPolicy.state !== 'success'" :title="backupPolicy.summary" type="warning" show-icon :closable="false" />

    <section class="ops-grid">
      <article class="ops-card env-card">
        <div class="ops-card-head">
          <span class="ops-step">01</span>
          <div>
            <h4>环境变量核对</h4>
            <p>必填项缺失时，前端无法连接 Supabase 云项目。</p>
          </div>
        </div>
        <div class="env-table">
          <div v-for="row in envRows" :key="row.key" class="env-row">
            <div class="env-main">
              <strong>{{ row.key }}</strong>
              <span>{{ row.description }}</span>
            </div>
            <div class="env-meta">
              <el-tag :type="tagType(row.state)" effect="plain">{{ row.stateText }}</el-tag>
              <span>{{ row.valueText }}</span>
            </div>
          </div>
        </div>
      </article>

      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">02</span>
          <div>
            <h4>备份策略</h4>
            <p>{{ backupPolicy.summary }}</p>
          </div>
        </div>
        <div class="policy-metrics">
          <div>
            <span>计划时间</span>
            <strong>{{ backupPolicy.time }}</strong>
          </div>
          <div>
            <span>保留天数</span>
            <strong>{{ backupPolicy.keepDays }} 天</strong>
          </div>
        </div>
        <ul class="ops-list">
          <li v-for="item in backupPolicy.nextActions" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">03</span>
          <div>
            <h4>云端控制台入口</h4>
            <p>所有真实备份、恢复、导出和权限核对均在 Supabase 控制台执行。</p>
          </div>
        </div>
        <div class="entry-list">
          <div v-for="item in consoleEntries" :key="item.title" class="entry-item">
            <strong>{{ item.title }}</strong>
            <span>{{ item.path }}</span>
            <small>{{ item.purpose }}</small>
          </div>
        </div>
      </article>

      <article class="ops-card">
        <div class="ops-card-head">
          <span class="ops-step">04</span>
          <div>
            <h4>恢复前检查清单</h4>
            <p>恢复操作必须同时覆盖数据、身份、附件和业务链路。</p>
          </div>
        </div>
        <div class="check-list">
          <div v-for="item in recoveryChecklist" :key="item.step" class="check-item">
            <span class="check-step">{{ item.step }}</span>
            <div>
              <div class="check-title">
                <strong>{{ item.title }}</strong>
                <el-tag :type="tagType(item.risk)" effect="plain" size="small">{{ item.risk === 'danger' ? '高风险' : item.risk === 'warning' ? '需复核' : '闭环' }}</el-tag>
              </div>
              <p>{{ item.detail }}</p>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { getSystemConfig } from '@/api/system'
import { supabaseRuntimeEnv } from '@/api/supabaseClient'
import { formatDateTime } from '@/utils'
import {
  buildCloudOpsBackupPolicy,
  buildCloudOpsConsoleEntries,
  buildCloudOpsEnvRows,
  buildCloudOpsExportPackage,
  buildCloudOpsRecoveryChecklist,
  getCloudOpsEnvState,
  type CloudOpsState,
} from '@/utils/cloud-ops'
import { DEFAULT_SYSTEM_CONFIG, normalizeSystemConfig, type SystemConfigForm } from '@/utils/system-config'

const loading = ref(false)
const checkedAt = ref(formatDateTime(new Date()))
const config = ref<SystemConfigForm>({ ...DEFAULT_SYSTEM_CONFIG })

const envRows = computed(() => buildCloudOpsEnvRows(supabaseRuntimeEnv))
const envState = computed(() => getCloudOpsEnvState(envRows.value))
const backupPolicy = computed(() => buildCloudOpsBackupPolicy(config.value))
const consoleEntries = computed(() => buildCloudOpsConsoleEntries(supabaseRuntimeEnv))
const recoveryChecklist = buildCloudOpsRecoveryChecklist()

const summaryCards = computed(() => [
  { label: '当前架构', value: '前端直连 Supabase', description: '无本地后端服务依赖' },
  { label: '最近检查', value: checkedAt.value, description: envState.value.summary },
  { label: '备份策略', value: backupPolicy.value.stateText, description: backupPolicy.value.summary },
  { label: '存储桶', value: supabaseRuntimeEnv.storageBucket, description: '业务附件恢复需同步核对' },
])

function tagType(state: CloudOpsState) {
  if (state === 'success') return 'success'
  if (state === 'warning') return 'warning'
  if (state === 'danger') return 'danger'
  return 'info'
}

async function refreshCheck() {
  loading.value = true
  try {
    const res = await getSystemConfig() as any
    config.value = normalizeSystemConfig(res.data || {})
  } catch {
    config.value = normalizeSystemConfig(config.value)
  } finally {
    checkedAt.value = formatDateTime(new Date())
    loading.value = false
  }
}

function exportOpsPackage() {
  const payload = buildCloudOpsExportPackage(supabaseRuntimeEnv, config.value)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `云库运维清单_${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  refreshCheck()
})
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
  width: min(360px, 100%);
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
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

.ops-summary-label,
.ops-summary-item small,
.entry-item small,
.env-main span,
.env-meta span,
.policy-metrics span {
  font-size: 12px;
  color: #8b95a1;
}

.ops-summary-item strong,
.policy-metrics strong {
  color: #1f2937;
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
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.ops-card-head h4 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.ops-card-head p,
.ops-list,
.check-item p {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.ops-step,
.check-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #eef4ff;
  color: #3159b7;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.env-table,
.entry-list,
.check-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.env-row,
.entry-item,
.check-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: #fafcff;
}

.env-main,
.entry-item {
  min-width: 0;
  flex: 1;
}

.env-main,
.env-meta,
.entry-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.env-meta {
  align-items: flex-end;
  flex-shrink: 0;
}

.policy-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.policy-metrics > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.ops-list {
  padding-left: 18px;
}

.check-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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

  .env-row,
  .check-item {
    flex-direction: column;
  }

  .env-meta {
    align-items: flex-start;
  }
}
</style>
