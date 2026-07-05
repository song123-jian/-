<template>
  <div class="injection-mobile-page">
    <van-nav-bar :title="pageTitle" left-arrow @click-left="goBack" />

    <template v-if="!selectedKey">
      <div class="module-grid">
        <button v-for="item in modules" :key="item.key" class="module-card" type="button" @click="openModule(item.key)">
          <span>{{ item.order }}</span>
          <strong>{{ item.shortTitle }}</strong>
          <small>{{ item.description }}</small>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="module-summary">
        <div>
          <span>全部</span>
          <strong>{{ summary.total }}</strong>
        </div>
        <div>
          <span>待处理</span>
          <strong>{{ summary.open }}</strong>
        </div>
        <div>
          <span>风险</span>
          <strong>{{ summary.risk }}</strong>
        </div>
      </div>

      <van-cell-group inset class="form-panel">
        <van-cell :title="module.shortTitle" :label="module.description" />
        <template v-for="field in module.formFields" :key="field.prop">
          <van-field
            v-if="field.type !== 'boolean' && field.type !== 'textarea'"
            v-model="form[field.prop]"
            :label="field.label"
            :type="field.type === 'number' ? 'number' : 'text'"
            :required="field.required"
            :placeholder="field.placeholder || `请输入${field.label}`"
          />
          <van-field
            v-else-if="field.type === 'textarea'"
            v-model="form[field.prop]"
            :label="field.label"
            type="textarea"
            rows="2"
            autosize
            :placeholder="field.placeholder || `请输入${field.label}`"
          />
          <van-cell v-else :title="field.label">
            <template #right-icon>
              <van-switch v-model="form[field.prop]" size="22" />
            </template>
          </van-cell>
        </template>
      </van-cell-group>

      <div class="action-row">
        <van-button block type="primary" :loading="saving" @click="submitRecord">提交记录</van-button>
      </div>

      <van-loading v-if="loading" class="page-loading">加载中...</van-loading>
      <van-empty v-else-if="rows.length === 0" description="暂无记录" />
      <van-cell-group v-else inset class="record-list">
        <van-cell v-for="row in rows" :key="row.id" :title="recordTitle(row)" :label="recordDescription(row)">
          <template #value>
            <van-tag :type="tagType(row.status)" plain>{{ injectionStatusText(row.status) }}</van-tag>
          </template>
          <template #extra>
            <van-button v-if="nextAction(row)" size="mini" type="primary" plain @click.stop="runNext(row)">
              {{ actionText(nextAction(row) || '') }}
            </van-button>
          </template>
        </van-cell>
      </van-cell-group>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  INJECTION_MODULES,
  buildInjectionRecordPayload,
  getInjectionModuleByKey,
  getInjectionNextActions,
  injectionStatusText,
  summarizeInjectionRecords,
  validateInjectionRecord,
  type InjectionModuleKey,
} from '../../utils/injection-professional'
import { createInjectionRecord, getInjectionList, runInjectionAction } from '../../api/injection'

const route = useRoute()
const router = useRouter()
const modules = INJECTION_MODULES
const rows = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const form = reactive<Record<string, any>>({})

const selectedKey = computed(() => {
  const raw = route.params.moduleKey
  return Array.isArray(raw) ? raw[0] : String(raw || '')
})
const module = computed(() => getInjectionModuleByKey(selectedKey.value || 'process-card'))
const pageTitle = computed(() => selectedKey.value ? module.value.shortTitle : '注塑专业')
const summary = computed(() => summarizeInjectionRecords(rows.value))

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function resetForm() {
  Object.keys(form).forEach((key) => delete form[key])
  for (const field of module.value.formFields) {
    if (field.type === 'boolean') form[field.prop] = true
    else form[field.prop] = field.type === 'number' ? undefined : ''
  }
  form.status = module.value.statusOptions[0]?.value || 'DRAFT'
}

async function loadRows() {
  if (!selectedKey.value) return
  loading.value = true
  try {
    const res = await getInjectionList(module.value.resource, { page: 1, pageSize: 30 })
    rows.value = unwrapRecords(res)
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function submitRecord() {
  const moduleKey = module.value.key as InjectionModuleKey
  const message = validateInjectionRecord(moduleKey, form)
  if (message) {
    showToast(message)
    return
  }
  saving.value = true
  try {
    await createInjectionRecord(module.value.resource, buildInjectionRecordPayload(moduleKey, form))
    showToast('提交成功')
    resetForm()
    await loadRows()
  } finally {
    saving.value = false
  }
}

function openModule(key: string) {
  router.push(`/m/injection/${key}`)
}

function goBack() {
  if (selectedKey.value) router.push('/m/injection')
  else router.back()
}

function recordTitle(row: any) {
  return row[module.value.codeField] || row.title || row.name || `记录${row.id}`
}

function recordDescription(row: any) {
  return module.value.listFields
    .filter((field) => field.prop !== 'status')
    .map((field) => row[field.prop])
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ') || module.value.description
}

function nextAction(row: any) {
  return getInjectionNextActions(row.status)[0]
}

async function runNext(row: any) {
  const action = nextAction(row)
  if (!action) return
  await runInjectionAction(module.value.resource, Number(row.id), action)
  showToast(`${actionText(action)}成功`)
  await loadRows()
}

function actionText(action: string) {
  const labels: Record<string, string> = { submit: '提交', approve: '审核', reject: '驳回', assign: '分派', start: '开始', finish: '完成', close: '关闭' }
  return labels[action] || action
}

function tagType(status?: string) {
  const value = String(status || '').toUpperCase()
  if (['FAILED', 'REJECTED', 'OPEN', 'REPORTED', 'OVERDUE'].includes(value)) return 'danger'
  if (['SUBMITTED', 'ASSIGNED', 'PROCESSING', 'WAIT_CONFIRM', 'TRIALING', 'WARNING'].includes(value)) return 'warning'
  if (['APPROVED', 'ACTIVE', 'PASSED', 'CLOSED', 'FINISHED', 'APPROVED_PRODUCTION', 'NORMAL', 'GENERATED'].includes(value)) return 'success'
  return 'primary'
}

watch(selectedKey, () => {
  resetForm()
  loadRows()
})

onMounted(() => {
  resetForm()
  loadRows()
})
</script>

<style scoped lang="scss">
.injection-mobile-page {
  min-height: 100vh;
  background: #eef2f6;
  padding-bottom: 24px;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.module-card {
  display: grid;
  gap: 6px;
  min-height: 116px;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
  text-align: left;

  span {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #0f766e;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }

  strong {
    color: #1f2933;
    font-size: 15px;
  }

  small {
    color: #64748b;
    line-height: 1.4;
  }
}

.module-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 12px;

  div {
    display: grid;
    gap: 4px;
    border: 1px solid #dfe5ec;
    border-radius: 8px;
    background: #fff;
    padding: 10px;
  }

  span {
    color: #64748b;
    font-size: 12px;
  }

  strong {
    color: #1f2933;
    font-size: 20px;
  }
}

.form-panel,
.record-list {
  margin-top: 0;
}

.action-row {
  padding: 12px;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 28px 0;
}
</style>
