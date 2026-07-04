<template>
  <div class="page-container">
    <PageHeader title="集成中心">
      <el-button plain @click="resetAll">
        <el-icon><Refresh /></el-icon>
        重置
      </el-button>
    </PageHeader>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover" class="form-card">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="PLC遥测" name="telemetry">
              <el-form ref="telemetryFormRef" :model="telemetryForm" label-width="110px" class="panel-form">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="机台编号">
                      <el-input-number v-model="telemetryForm.machineId" :min="1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="机台编码">
                      <el-input v-model="telemetryForm.machineCode" placeholder="IM-001" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="状态">
                      <el-select v-model="telemetryForm.status" placeholder="可选" clearable>
                        <el-option label="运行中" value="RUNNING" />
                        <el-option label="空闲" value="IDLE" />
                        <el-option label="停机" value="STOPPED" />
                        <el-option label="维修中" value="MAINTENANCE" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="生产单编号">
                      <el-input-number v-model="telemetryForm.prodOrderId" :min="1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="工单编号">
                      <el-input v-model="telemetryForm.orderNo" placeholder="PO-20260627-001" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="模具编号">
                      <el-input-number v-model="telemetryForm.moldId" :min="1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="产量">
                      <el-input-number v-model="telemetryForm.qty" :min="0" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="不良数">
                      <el-input-number v-model="telemetryForm.badQty" :min="0" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="模次">
                      <el-input-number v-model="telemetryForm.shots" :min="0" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="报工类型">
                      <el-select v-model="telemetryForm.reportType" clearable placeholder="默认 OUTPUT">
                        <el-option label="产量" value="OUTPUT" />
                        <el-option label="不良" value="BAD" />
                        <el-option label="停机" value="DOWNTIME" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="班次">
                      <el-select v-model="telemetryForm.shift" clearable placeholder="默认 DAY">
                        <el-option label="白班" value="DAY" />
                        <el-option label="夜班" value="NIGHT" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="开始时间">
                      <el-date-picker
                        v-model="telemetryForm.startTime"
                        type="datetime"
                        placeholder="选择开始时间"
                        value-format="YYYY-MM-DDTHH:mm:ss"
                        style="width: 100%"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="结束时间">
                      <el-date-picker
                        v-model="telemetryForm.endTime"
                        type="datetime"
                        placeholder="选择结束时间"
                        value-format="YYYY-MM-DDTHH:mm:ss"
                        style="width: 100%"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="来源">
                      <el-input v-model="telemetryForm.source" placeholder="PLC / MES / 手工录入" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="备注">
                      <el-input v-model="telemetryForm.remark" placeholder="可选备注" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-alert
                  type="info"
                  :closable="false"
                  show-icon
                  title="机台编号或机台编码至少填写一个"
                  class="form-tip"
                />
                <el-form-item>
                  <el-button type="primary" :loading="loading.telemetry" @click="submitTelemetry">
                    <el-icon><Position /></el-icon>
                    发送遥测
                  </el-button>
                  <el-button @click="fillTelemetrySample">填充示例</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="扫码识别" name="scan">
              <el-form ref="scanFormRef" :model="scanForm" :rules="scanRules" label-width="110px" class="panel-form">
                <el-form-item label="扫码内容" prop="code">
                  <el-input v-model="scanForm.code" placeholder="MACHINE:IM-001 / MOLD:MO-001 / PRODUCT:PR-001" />
                </el-form-item>
                <el-form-item label="类型">
                  <el-select v-model="scanForm.codeType" clearable placeholder="自动识别">
                    <el-option label="机台" value="MACHINE" />
                    <el-option label="模具" value="MOLD" />
                    <el-option label="产品" value="PRODUCT" />
                    <el-option label="批次" value="BATCH" />
                  </el-select>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="loading.scan" @click="submitScan">
                    <el-icon><Search /></el-icon>
                    扫码识别
                  </el-button>
                  <el-button @click="fillScanSample">填充示例</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="标签预览" name="label">
              <el-form ref="labelFormRef" :model="labelForm" :rules="labelRules" label-width="110px" class="panel-form">
                <el-form-item label="目标类型" prop="targetType">
                  <el-select v-model="labelForm.targetType" placeholder="请选择类型">
                    <el-option label="机台" value="MACHINE" />
                    <el-option label="模具" value="MOLD" />
                    <el-option label="产品" value="PRODUCT" />
                    <el-option label="批次" value="BATCH" />
                  </el-select>
                </el-form-item>
                <el-form-item label="目标编号" prop="targetId">
                  <el-input-number v-model="labelForm.targetId" :min="1" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="loading.label" @click="submitLabel">
                    <el-icon><Tickets /></el-icon>
                    预览标签
                  </el-button>
                  <el-button @click="fillLabelSample">填充示例</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="称重换算" name="scale">
              <el-form ref="scaleFormRef" :model="scaleForm" :rules="scaleRules" label-width="110px" class="panel-form">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="产品编号">
                      <el-input-number v-model="scaleForm.productId" :min="1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="毛重" prop="grossWeight">
                      <el-input-number v-model="scaleForm.grossWeight" :min="0" :precision="3" :step="0.1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="皮重">
                      <el-input-number v-model="scaleForm.tareWeight" :min="0" :precision="3" :step="0.1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="单件重">
                      <el-input-number v-model="scaleForm.unitWeight" :min="0" :precision="3" :step="0.1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item>
                  <el-button type="primary" :loading="loading.scale" @click="submitScale">
                    <el-icon><ScaleToOriginal /></el-icon>
                    换算
                  </el-button>
                  <el-button @click="fillScaleSample">填充示例</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="推送测试" name="push">
              <el-form ref="pushFormRef" :model="pushForm" :rules="pushRules" label-width="110px" class="panel-form">
                <el-form-item label="标题" prop="title">
                  <el-input v-model="pushForm.title" placeholder="请输入标题" />
                </el-form-item>
                <el-form-item label="内容" prop="content">
                  <el-input v-model="pushForm.content" type="textarea" :rows="5" placeholder="请输入内容" />
                </el-form-item>
                <el-form-item label="类型">
                  <el-select v-model="pushForm.type" placeholder="默认 INFO" clearable>
                    <el-option label="信息" value="INFO" />
                    <el-option label="警告" value="WARNING" />
                    <el-option label="异常" value="ERROR" />
                  </el-select>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="loading.push" @click="submitPush">
                    <el-icon><Promotion /></el-icon>
                    发送测试
                  </el-button>
                  <el-button @click="fillPushSample">填充示例</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card shadow="hover" class="result-card">
          <template #header>
            <div class="result-header">
              <span>{{ result.title }}</span>
              <el-tag v-if="result.state" :type="resultTagType">{{ result.stateText }}</el-tag>
            </div>
          </template>
          <div v-if="result.summary" class="result-summary">{{ result.summary }}</div>
          <pre class="result-json">{{ resultText }}</pre>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { convertScale, previewLabel, pushTelemetry, pushTest, scanIntegration } from '@/api/integration'
import {
  buildIntegrationResult,
  convertIntegrationScale,
  normalizeIntegrationLabel,
  normalizeIntegrationPush,
  normalizeIntegrationScan,
  normalizeIntegrationTelemetry,
  validateIntegrationLabel,
  validateIntegrationPush,
  validateIntegrationScale,
  validateIntegrationScan,
  validateIntegrationTelemetry,
  type IntegrationResult,
  type IntegrationResultState,
} from '@/utils/integration-center'

const activeTab = ref('telemetry')

const telemetryFormRef = ref<FormInstance>()
const scanFormRef = ref<FormInstance>()
const labelFormRef = ref<FormInstance>()
const scaleFormRef = ref<FormInstance>()
const pushFormRef = ref<FormInstance>()

const loading = reactive({
  telemetry: false,
  scan: false,
  label: false,
  scale: false,
  push: false,
})

const telemetryForm = reactive({
  machineId: null as number | null,
  machineCode: '',
  status: '',
  prodOrderId: null as number | null,
  orderNo: '',
  moldId: null as number | null,
  qty: null as number | null,
  badQty: null as number | null,
  shots: null as number | null,
  reportType: '',
  shift: '',
  startTime: '',
  endTime: '',
  source: 'WEB',
  remark: '',
})

const scanForm = reactive({
  code: '',
  codeType: '',
})

const labelForm = reactive({
  targetType: 'MACHINE',
  targetId: null as number | null,
})

const scaleForm = reactive({
  productId: null as number | null,
  grossWeight: 0,
  tareWeight: 0,
  unitWeight: 0,
})

const pushForm = reactive({
  title: '',
  content: '',
  type: 'INFO',
})

const scanRules: FormRules = {
  code: [{ required: true, message: '请输入扫码内容', trigger: 'blur' }],
}

const labelRules: FormRules = {
  targetType: [{ required: true, message: '请选择目标类型', trigger: 'change' }],
  targetId: [{ required: true, message: '请输入目标编号', trigger: 'change' }],
}

const scaleRules: FormRules = {
  grossWeight: [{ required: true, message: '请输入毛重', trigger: 'change' }],
}

const pushRules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
}

const result = reactive({
  title: '结果',
  summary: '',
  state: '',
  stateText: '',
  payload: {} as Record<string, unknown>,
})

const resultTagType = computed(() => {
  if (result.state === 'success') return 'success'
  if (result.state === 'warning') return 'warning'
  if (result.state === 'error') return 'danger'
  return 'info'
})

const resultText = computed(() => JSON.stringify(result.payload, null, 2))

function updateResult(title: string, summary: string, state: IntegrationResultState, payload: Record<string, unknown>) {
  result.title = title
  result.summary = summary
  result.state = state
  result.stateText = state === 'success' ? '成功' : state === 'warning' ? '提示' : state === 'error' ? '失败' : '信息'
  result.payload = payload
}

function updateIntegrationResult(title: string, data?: Partial<IntegrationResult>) {
  updateResult(
    title,
    data?.summary || '操作完成',
    data?.state || 'info',
    (data?.payload || data || {}) as Record<string, unknown>,
  )
}

function updateValidationResult(title: string, message: string, payload: Record<string, unknown>) {
  const data = buildIntegrationResult('warning', message, payload)
  updateIntegrationResult(title, data)
  ElMessage.warning(message)
}

function resetAll() {
  activeTab.value = 'telemetry'
  telemetryFormRef.value?.clearValidate()
  scanFormRef.value?.clearValidate()
  labelFormRef.value?.clearValidate()
  scaleFormRef.value?.clearValidate()
  pushFormRef.value?.clearValidate()
  Object.assign(telemetryForm, {
    machineId: null,
    machineCode: '',
    status: '',
    prodOrderId: null,
    orderNo: '',
    moldId: null,
    qty: null,
    badQty: null,
    shots: null,
    reportType: '',
    shift: '',
    startTime: '',
    endTime: '',
    source: 'WEB',
    remark: '',
  })
  Object.assign(scanForm, { code: '', codeType: '' })
  Object.assign(labelForm, { targetType: 'MACHINE', targetId: null })
  Object.assign(scaleForm, { productId: null, grossWeight: 0, tareWeight: 0, unitWeight: 0 })
  Object.assign(pushForm, { title: '', content: '', type: 'INFO' })
  updateResult('结果', '已重置', 'info', {})
}

function fillTelemetrySample() {
  Object.assign(telemetryForm, {
    machineId: 1,
    machineCode: 'IM-001',
    status: 'RUNNING',
    prodOrderId: 1,
    orderNo: 'PO-20260627-001',
    moldId: 1,
    qty: 100,
    badQty: 2,
    shots: 120,
    reportType: 'OUTPUT',
    shift: 'DAY',
    startTime: new Date().toISOString().slice(0, 19),
    endTime: new Date().toISOString().slice(0, 19),
    source: 'WEB',
    remark: '示例遥测',
  })
}

function fillScanSample() {
  Object.assign(scanForm, { code: 'MACHINE:IM-001', codeType: 'MACHINE' })
}

function fillLabelSample() {
  Object.assign(labelForm, { targetType: 'MACHINE', targetId: 1 })
}

function fillScaleSample() {
  Object.assign(scaleForm, { productId: 1, grossWeight: 12.5, tareWeight: 0.5, unitWeight: 0.05 })
}

function fillPushSample() {
  Object.assign(pushForm, {
    title: '推送测试',
    content: '这是一条注塑厂集成中心的测试消息。',
    type: 'INFO',
  })
}

async function submitTelemetry() {
  const validationMessage = validateIntegrationTelemetry(telemetryForm)
  if (validationMessage) {
    updateValidationResult('PLC遥测', validationMessage, normalizeIntegrationTelemetry(telemetryForm) as unknown as Record<string, unknown>)
    return
  }
  loading.telemetry = true
  try {
    const payload = normalizeIntegrationTelemetry(telemetryForm)
    const res: any = await pushTelemetry(payload)
    updateIntegrationResult('PLC遥测', res.data)
    ElMessage.success('遥测已发送')
  } catch (error: any) {
    updateResult('PLC遥测', error?.message || '发送失败', 'error', normalizeIntegrationTelemetry(telemetryForm) as unknown as Record<string, unknown>)
  } finally {
    loading.telemetry = false
  }
}

async function submitScan() {
  const valid = await scanFormRef.value?.validate().catch(() => false)
  if (!valid) return
  const validationMessage = validateIntegrationScan(scanForm)
  if (validationMessage) {
    updateValidationResult('扫码识别', validationMessage, normalizeIntegrationScan(scanForm) as unknown as Record<string, unknown>)
    return
  }
  loading.scan = true
  try {
    const payload = normalizeIntegrationScan(scanForm)
    const res: any = await scanIntegration(payload)
    updateIntegrationResult('扫码识别', res.data)
  } catch (error: any) {
    updateResult('扫码识别', error?.message || '识别失败', 'error', normalizeIntegrationScan(scanForm) as unknown as Record<string, unknown>)
  } finally {
    loading.scan = false
  }
}

async function submitLabel() {
  const valid = await labelFormRef.value?.validate().catch(() => false)
  if (!valid) return
  const validationMessage = validateIntegrationLabel(labelForm)
  if (validationMessage) {
    updateValidationResult('标签预览', validationMessage, normalizeIntegrationLabel(labelForm) as unknown as Record<string, unknown>)
    return
  }
  loading.label = true
  try {
    const payload = normalizeIntegrationLabel(labelForm)
    const res: any = await previewLabel(payload)
    updateIntegrationResult('标签预览', res.data)
  } catch (error: any) {
    updateResult('标签预览', error?.message || '预览失败', 'error', normalizeIntegrationLabel(labelForm) as unknown as Record<string, unknown>)
  } finally {
    loading.label = false
  }
}

async function submitScale() {
  const valid = await scaleFormRef.value?.validate().catch(() => false)
  if (!valid) return
  const validationMessage = validateIntegrationScale(scaleForm)
  if (validationMessage) {
    updateValidationResult('称重换算', validationMessage, convertIntegrationScale(scaleForm) as unknown as Record<string, unknown>)
    return
  }
  const payload = convertIntegrationScale(scaleForm)
  loading.scale = true
  try {
    const res: any = await convertScale(payload)
    updateIntegrationResult('称重换算', res.data)
  } catch (error: any) {
    updateResult('称重换算', error?.message || '换算失败', 'error', payload as unknown as Record<string, unknown>)
  } finally {
    loading.scale = false
  }
}

async function submitPush() {
  const valid = await pushFormRef.value?.validate().catch(() => false)
  if (!valid) return
  const validationMessage = validateIntegrationPush(pushForm)
  if (validationMessage) {
    updateValidationResult('推送测试', validationMessage, normalizeIntegrationPush(pushForm) as unknown as Record<string, unknown>)
    return
  }
  loading.push = true
  try {
    const payload = normalizeIntegrationPush(pushForm)
    const res: any = await pushTest(payload)
    updateIntegrationResult('推送测试', res.data)
  } catch (error: any) {
    updateResult('推送测试', error?.message || '推送失败', 'error', normalizeIntegrationPush(pushForm) as unknown as Record<string, unknown>)
  } finally {
    loading.push = false
  }
}
</script>

<style scoped lang="scss">
.form-card,
.result-card {
  min-height: 560px;
}

.panel-form {
  padding-top: 4px;
}

.form-tip {
  margin-bottom: 16px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-summary {
  margin-bottom: 12px;
  color: #606266;
}

.result-json {
  margin: 0;
  padding: 12px;
  background: #f8fafc;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 480px;
  font-size: 13px;
  line-height: 1.6;
}
</style>
