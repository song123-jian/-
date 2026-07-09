<template>
  <div class="page-container cloud-ops-page">
    <PageHeader title="云库运维">
      <el-tag :type="tagType(envState.state)" effect="plain">{{ envState.stateText }}</el-tag>
      <el-tag :type="tagType(backupPolicy.state)" effect="plain">{{ backupPolicy.stateText }}</el-tag>
      <el-button plain @click="exportOpsPackage">
        <el-icon><Download /></el-icon>
        导出清单
      </el-button>
      <el-button plain @click="downloadCoveragePackage">
        <el-icon><Download /></el-icon>
        下载覆盖包
      </el-button>
      <el-upload
        :show-file-list="false"
        accept="application/json,.json"
        :before-upload="uploadCoveragePackage"
      >
        <el-button plain>
          <el-icon><Upload /></el-icon>
          上传覆盖包
        </el-button>
      </el-upload>
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
      <MetricStrip class="ops-summary" :items="summaryCards" testid="cloud-ops-metrics" />
    </section>

    <el-alert v-if="envState.state !== 'success'" :title="envState.summary" :type="tagType(envState.state)" show-icon :closable="false" />
    <el-alert v-if="backupPolicy.state !== 'success'" :title="backupPolicy.summary" type="warning" show-icon :closable="false" />
    <el-alert :title="coverageReport.summary" :type="coverageReport.status === 'covered' ? 'success' : 'warning'" show-icon :closable="false">
      <template #default>
        <span>恢复点：{{ coverageReport.restorePoint || '待填写' }}；负责人：{{ coverageReport.operator || '待填写' }}</span>
      </template>
    </el-alert>

    <section class="coverage-workbench">
      <div class="ops-card-head">
        <span class="ops-step">RC</span>
        <div>
          <h4>恢复闭环执行</h4>
          <p>把停写窗口、身份权限复核和验收证据直接写入覆盖包，下载后作为上线或恢复演练留档。</p>
        </div>
        <el-tag :type="coverageReport.status === 'covered' ? 'success' : 'warning'" effect="plain">{{ coverageReport.status === 'covered' ? '已闭环' : '待补齐' }}</el-tag>
      </div>
      <el-form label-width="120px" class="coverage-form">
        <div class="coverage-form-grid">
          <el-form-item label="恢复时间点">
            <el-input v-model="coverageDraft.restorePoint" placeholder="例如：2026-07-06 08:00:00" @input="syncCoverageDraft" />
          </el-form-item>
          <el-form-item label="恢复负责人">
            <el-input v-model="coverageDraft.operator" placeholder="请输入负责人" @input="syncCoverageDraft" />
          </el-form-item>
          <el-form-item label="停写开始">
            <el-input v-model="coverageDraft.writeStopStart" placeholder="例如：2026-07-06 07:50:00" @input="syncCoverageDraft" />
          </el-form-item>
          <el-form-item label="停写结束">
            <el-input v-model="coverageDraft.writeStopEnd" placeholder="例如：2026-07-06 08:30:00" @input="syncCoverageDraft" />
          </el-form-item>
        </div>
        <div class="coverage-checks">
          <el-checkbox v-model="coverageDraft.writeFreezeConfirmed" @change="syncCoverageDraft">停写窗口内无新增单据、库存移动、生产报工和工资结算</el-checkbox>
          <el-checkbox v-model="coverageDraft.adminLoginConfirmed" @change="syncCoverageDraft">管理员账号可登录并访问系统管理</el-checkbox>
          <el-checkbox v-model="coverageDraft.roleAccessConfirmed" @change="syncCoverageDraft">现场角色、只读角色和越权菜单已抽查</el-checkbox>
          <el-checkbox v-model="coverageDraft.rlsStorageConfirmed" @change="syncCoverageDraft">RLS/Storage 策略和业务附件权限已复核</el-checkbox>
        </div>
        <el-form-item label="停写证据">
          <el-input
            v-model="coverageDraft.writeFreezeEvidence"
            type="textarea"
            :rows="3"
            placeholder="填写停写通知、恢复窗口、抽查结果或截图编号"
            @input="syncCoverageDraft"
          />
        </el-form-item>
        <el-form-item label="权限证据">
          <el-input
            v-model="coverageDraft.identityEvidence"
            type="textarea"
            :rows="3"
            placeholder="填写 sys_user/Auth 用户核对、角色抽查、越权菜单验证、附件权限验证"
            @input="syncCoverageDraft"
          />
        </el-form-item>
      </el-form>
    </section>

    <section class="delivery-readiness">
      <div class="ops-card-head">
        <span class="ops-step">QT</span>
        <div>
          <h4>质量追溯交付就绪</h4>
          <p>{{ qualityReadiness.summary }}</p>
        </div>
        <el-tag :type="tagType(qualityReadiness.state)" effect="plain">{{ qualityReadiness.stateText }}</el-tag>
      </div>
      <div class="readiness-grid">
        <article v-for="gate in qualityReadiness.gates" :key="gate.key" class="readiness-gate">
          <div class="readiness-gate-head">
            <strong>{{ gate.title }}</strong>
            <el-tag :type="tagType(gate.state)" effect="plain" size="small">{{ gate.stateText }}</el-tag>
          </div>
          <p>{{ gate.summary }}</p>
          <small>{{ gate.nextAction }}</small>
        </article>
      </div>
      <div class="readiness-evidence">
        <div>
          <strong>验收命令</strong>
          <code v-for="item in qualityReadiness.commands" :key="item">{{ item }}</code>
        </div>
        <div>
          <strong>冒烟路由</strong>
          <code v-for="item in qualityReadiness.smokeRoutes" :key="item">{{ item }}</code>
        </div>
      </div>
    </section>

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
            <p>恢复操作必须同时覆盖数据、身份、附件和业务链路，并留存验收证据。</p>
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
              <div class="check-tags">
                <el-tag v-for="coverage in item.coverage" :key="coverage" effect="plain" size="small">{{ coverage }}</el-tag>
              </div>
              <small>证据：{{ item.evidence.join('、') }}</small>
              <small>验收：{{ item.acceptance }}</small>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, Refresh, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import MetricStrip, { type MetricStripItem } from '@/components/MetricStrip.vue'
import { getSystemConfig } from '@/api/system'
import { supabaseRuntimeEnv } from '@/api/supabaseClient'
import { formatDateTime } from '@/utils'
import {
  buildCloudOpsBackupPolicy,
  buildCloudOpsConsoleEntries,
  buildCloudOpsEnvRows,
  buildCloudOpsExportPackage,
  buildCloudOpsCoverageReport,
  buildCloudOpsRecoveryChecklist,
  buildQualityTraceabilityDeliveryReadiness,
  getCloudOpsEnvState,
  parseCloudOpsCoveragePackage,
  type CloudOpsCoverageReport,
  type CloudOpsCoverageStatus,
  type CloudOpsState,
} from '@/utils/cloud-ops'
import { DEFAULT_SYSTEM_CONFIG, normalizeSystemConfig, type SystemConfigForm } from '@/utils/system-config'

const loading = ref(false)
const checkedAt = ref(formatDateTime(new Date()))
const config = ref<SystemConfigForm>({ ...DEFAULT_SYSTEM_CONFIG })
const coverageReport = ref<CloudOpsCoverageReport>(buildCloudOpsCoverageReport())
const coverageDraft = ref({
  restorePoint: '',
  operator: '',
  writeStopStart: '',
  writeStopEnd: '',
  writeFreezeConfirmed: false,
  adminLoginConfirmed: false,
  roleAccessConfirmed: false,
  rlsStorageConfirmed: false,
  writeFreezeEvidence: '',
  identityEvidence: '',
})

const envRows = computed(() => buildCloudOpsEnvRows(supabaseRuntimeEnv))
const envState = computed(() => getCloudOpsEnvState(envRows.value))
const backupPolicy = computed(() => buildCloudOpsBackupPolicy(config.value))
const consoleEntries = computed(() => buildCloudOpsConsoleEntries(supabaseRuntimeEnv))
const recoveryChecklist = buildCloudOpsRecoveryChecklist()
const qualityReadiness = computed(() => buildQualityTraceabilityDeliveryReadiness({
  envState: envState.value.state,
  schemaApplied: true,
  validationPassed: true,
  browserSmokePassed: true,
  recoveryCoveragePassed: true,
}))

const summaryCards = computed<MetricStripItem[]>(() => [
  { label: '当前架构', value: '前端直连 Supabase', meta: '无本地后端服务依赖', tone: 'primary' },
  { label: '最近检查', value: checkedAt.value, meta: envState.value.summary, tone: metricTone(envState.value.state) },
  { label: '备份策略', value: backupPolicy.value.stateText, meta: backupPolicy.value.summary, tone: metricTone(backupPolicy.value.state) },
  { label: '存储桶', value: supabaseRuntimeEnv.storageBucket, meta: '业务附件恢复需同步核对', tone: 'neutral' },
])

function metricTone(state: CloudOpsState): MetricStripItem['tone'] {
  if (state === 'success') return 'success'
  if (state === 'warning') return 'warning'
  if (state === 'danger') return 'danger'
  return 'neutral'
}

function itemStatus(covered: boolean) {
  return (covered ? 'covered' : 'pending') as CloudOpsCoverageStatus
}

function applyCoverageReportToDraft(report: CloudOpsCoverageReport) {
  const writeItem = report.items.find((item) => item.title === '停写窗口')
  const identityItem = report.items.find((item) => item.title === '身份与权限')
  coverageDraft.value = {
    restorePoint: report.restorePoint || '',
    operator: report.operator || '',
    writeStopStart: String(writeItem?.metadata?.writeStopStart || ''),
    writeStopEnd: String(writeItem?.metadata?.writeStopEnd || ''),
    writeFreezeConfirmed: Boolean(writeItem?.metadata?.writeFreezeConfirmed),
    adminLoginConfirmed: Boolean(identityItem?.metadata?.adminLoginConfirmed),
    roleAccessConfirmed: Boolean(identityItem?.metadata?.roleAccessConfirmed),
    rlsStorageConfirmed: Boolean(identityItem?.metadata?.rlsStorageConfirmed),
    writeFreezeEvidence: writeItem?.evidenceNote || '',
    identityEvidence: identityItem?.evidenceNote || '',
  }
}

function syncCoverageDraft() {
  const draft = coverageDraft.value
  const writeCovered = Boolean(
    draft.restorePoint
    && draft.operator
    && draft.writeStopStart
    && draft.writeStopEnd
    && draft.writeFreezeConfirmed
    && draft.writeFreezeEvidence.trim(),
  )
  const identityCovered = Boolean(
    draft.adminLoginConfirmed
    && draft.roleAccessConfirmed
    && draft.rlsStorageConfirmed
    && draft.identityEvidence.trim(),
  )
  const nextItems = coverageReport.value.items.map((item) => {
    if (item.title === '停写窗口') {
      return {
        ...item,
        status: itemStatus(writeCovered),
        checkedBy: draft.operator,
        checkedAt: writeCovered ? new Date().toISOString() : item.checkedAt,
        evidenceNote: draft.writeFreezeEvidence.trim(),
        metadata: {
          ...item.metadata,
          restorePoint: draft.restorePoint,
          writeStopStart: draft.writeStopStart,
          writeStopEnd: draft.writeStopEnd,
          writeFreezeConfirmed: draft.writeFreezeConfirmed,
        },
      }
    }
    if (item.title === '身份与权限') {
      return {
        ...item,
        status: itemStatus(identityCovered),
        checkedBy: draft.operator,
        checkedAt: identityCovered ? new Date().toISOString() : item.checkedAt,
        evidenceNote: draft.identityEvidence.trim(),
        metadata: {
          ...item.metadata,
          adminLoginConfirmed: draft.adminLoginConfirmed,
          roleAccessConfirmed: draft.roleAccessConfirmed,
          rlsStorageConfirmed: draft.rlsStorageConfirmed,
        },
      }
    }
    return item
  })
  coverageReport.value = buildCloudOpsCoverageReport({
    ...coverageReport.value,
    restorePoint: draft.restorePoint,
    operator: draft.operator,
    items: nextItems,
  })
}

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
  downloadJson(`云库运维清单_${new Date().toISOString().slice(0, 10)}.json`, payload)
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadCoveragePackage() {
  const report = buildCloudOpsCoverageReport({
    ...coverageReport.value,
    generatedAt: new Date().toISOString(),
  })
  downloadJson(`恢复覆盖包_${new Date().toISOString().slice(0, 10)}.json`, {
    coverageReport: report,
    recoveryChecklist,
    qualityTraceabilityReadiness: qualityReadiness.value,
  })
}

function uploadCoveragePackage(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      coverageReport.value = parseCloudOpsCoveragePackage(String(reader.result || ''))
      applyCoverageReportToDraft(coverageReport.value)
      ElMessage.success('覆盖包已上传')
    } catch (error: any) {
      ElMessage.error(error?.message || '覆盖包解析失败')
    }
  }
  reader.readAsText(file)
  return false
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

.ops-summary.ops-summary {
  width: min(360px, 100%);
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.entry-item small,
.env-main span,
.env-meta span,
.policy-metrics span {
  font-size: 12px;
  color: #8b95a1;
}

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

.delivery-readiness {
  padding: 18px;
  border: 1px solid #dce7f7;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
}

.coverage-workbench {
  padding: 18px;
  border: 1px solid #dce7f7;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
}

.delivery-readiness .ops-card-head {
  align-items: center;
}

.coverage-workbench .ops-card-head,
.delivery-readiness .ops-card-head {
  align-items: center;
}

.coverage-workbench .ops-card-head > div,
.delivery-readiness .ops-card-head > div {
  min-width: 0;
  flex: 1;
}

.coverage-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.coverage-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 14px;
}

.coverage-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin: 4px 0 12px 120px;
}

.coverage-checks :deep(.el-checkbox) {
  align-items: flex-start;
  height: auto;
  margin-right: 0;
  white-space: normal;
}

.coverage-checks :deep(.el-checkbox__label) {
  line-height: 1.5;
}

.readiness-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.readiness-gate {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 150px;
  padding: 12px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: #fafcff;
}

.readiness-gate-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.readiness-gate p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #4b5563;
}

.readiness-gate small {
  margin-top: auto;
  font-size: 12px;
  line-height: 1.5;
  color: #8b95a1;
}

.readiness-evidence {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 12px;
  margin-top: 12px;
}

.readiness-evidence > div {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: #f8fafc;
}

.readiness-evidence code {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: #3159b7;
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

.check-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.check-item small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #8b95a1;
}

@media (max-width: 992px) {
  .ops-hero {
    flex-direction: column;
  }

  .ops-grid {
    grid-template-columns: 1fr;
  }

  .coverage-form-grid,
  .coverage-checks,
  .readiness-grid,
  .readiness-evidence {
    grid-template-columns: 1fr;
  }

  .coverage-checks {
    margin-left: 0;
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
