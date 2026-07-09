<template>
  <div class="abnormal-report-page">
    <van-nav-bar title="异常上报" left-arrow @click-left="router.back()" />

    <div class="summary-panel">
      <div>
        <span>闭环入口</span>
        <strong>现场异常</strong>
      </div>
      <van-tag :type="online ? 'success' : 'warning'" plain>
        {{ online ? '在线提交' : '离线暂存' }}
      </van-tag>
    </div>

    <van-cell-group inset class="form-panel">
      <van-cell title="异常来源">
        <template #label>
          <van-radio-group v-model="form.sourceType" direction="horizontal" class="radio-row">
            <van-radio name="PRODUCTION_SITE">现场</van-radio>
            <van-radio name="MACHINE">设备</van-radio>
            <van-radio name="MOLD">模具</van-radio>
            <van-radio name="QUALITY">质量</van-radio>
            <van-radio name="MATERIAL">物料</van-radio>
          </van-radio-group>
        </template>
      </van-cell>
      <van-cell title="异常等级">
        <template #label>
          <van-radio-group v-model="form.level" direction="horizontal" class="radio-row">
            <van-radio name="INFO">一般</van-radio>
            <van-radio name="WARNING">警告</van-radio>
            <van-radio name="CRITICAL">严重</van-radio>
          </van-radio-group>
        </template>
      </van-cell>
      <van-field v-model="form.sourceId" label="关联编号" type="number" placeholder="工单/机台/模具编号，可选" />
      <van-field v-model.trim="form.title" label="异常标题" required placeholder="例如 A01 机台温度报警" />
      <van-field
        v-model.trim="form.description"
        label="异常说明"
        type="textarea"
        rows="4"
        autosize
        placeholder="描述异常现象、影响订单、已采取措施"
      />
      <van-field v-model="form.assigneeId" label="处理人ID" type="number" placeholder="可选" />
    </van-cell-group>

    <div class="action-row">
      <van-button block type="primary" :loading="saving" @click="submitAbnormal">提交异常</van-button>
      <van-button block plain type="primary" @click="router.push('/m/offline-tasks')">离线任务</van-button>
    </div>

    <van-cell-group v-if="lastTask" inset class="result-panel">
      <van-cell title="最近暂存" :label="lastTask.description">
        <template #value>
          <van-tag type="warning" plain>待同步</van-tag>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { createInjectionRecord } from '../../api/injection'
import { buildInjectionRecordPayload, validateInjectionRecord } from '../../utils/injection-professional'
import { saveOfflineActionTask, type OfflineActionTask } from '../../utils/offline'

const router = useRouter()
const saving = ref(false)
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const lastTask = ref<OfflineActionTask | null>(null)

const form = reactive({
  sourceType: 'PRODUCTION_SITE',
  sourceId: '',
  level: 'WARNING',
  title: '',
  description: '',
  assigneeId: '',
})

function updateOnline() {
  online.value = navigator.onLine
}

function resetForm() {
  form.sourceType = 'PRODUCTION_SITE'
  form.sourceId = ''
  form.level = 'WARNING'
  form.title = ''
  form.description = ''
  form.assigneeId = ''
}

function buildPayload() {
  return buildInjectionRecordPayload('andon-event', {
    sourceType: form.sourceType,
    sourceId: Number(form.sourceId || 0) || undefined,
    level: form.level,
    title: form.title,
    description: form.description,
    assigneeId: Number(form.assigneeId || 0) || undefined,
    status: 'OPEN',
  })
}

function saveOffline(payload: Record<string, any>, message = '当前离线，异常已暂存') {
  const task = saveOfflineActionTask({
    source: 'andon',
    title: `异常上报：${payload.title}`,
    description: `${payload.sourceType || '现场'} / ${payload.level || 'WARNING'} / ${payload.description || '-'}`,
    payload,
    last_error: message,
  })
  lastTask.value = task
  showToast(message)
  resetForm()
}

async function submitAbnormal() {
  const payload = buildPayload()
  const message = validateInjectionRecord('andon-event', payload)
  if (message) {
    showToast(message)
    return
  }

  if (!online.value) {
    saveOffline(payload)
    return
  }

  saving.value = true
  try {
    await createInjectionRecord('andon-events', payload)
    showToast('异常已提交')
    resetForm()
  } catch (error: any) {
    saveOffline(payload, error?.message || '提交失败，已转为离线任务')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
})

onUnmounted(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
})
</script>

<style scoped lang="scss">
.abnormal-report-page {
  min-height: 100vh;
  background: #eef2f6;
  padding-bottom: 24px;
}

.summary-panel {
  margin: 12px;
  padding: 14px;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  div {
    display: grid;
    gap: 4px;
  }

  span {
    color: #64748b;
    font-size: 12px;
  }

  strong {
    color: #1f2933;
    font-size: 18px;
  }
}

.form-panel,
.result-panel {
  margin-top: 0;
}

.radio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding-top: 8px;
}

.action-row {
  display: grid;
  gap: 10px;
  padding: 12px;
}
</style>
