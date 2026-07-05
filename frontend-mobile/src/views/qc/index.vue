<template>
  <div class="qc-page">
    <van-nav-bar title="质检录入" left-arrow @click-left="router.back()" />

    <van-steps :active="step" active-color="#07c160">
      <van-step>选择工单</van-step>
      <van-step>录入质检</van-step>
      <van-step>拍照提交</van-step>
    </van-steps>

    <div v-if="step === 0" class="step-content">
      <van-loading v-if="ordersLoading" class="page-loading" type="spinner">加载中...</van-loading>
      <van-empty v-else-if="orders.length === 0" description="暂无待质检工单" />
      <van-radio-group v-else v-model="selectedOrderId">
        <van-cell-group inset>
          <van-cell
            v-for="order in orders"
            :key="order.workOrderId"
            :title="order.productName"
            :label="order.workOrderNo"
            clickable
            @click="selectOrder(order)"
          >
            <template #right-icon>
              <van-radio :name="order.workOrderId" />
            </template>
          </van-cell>
        </van-cell-group>
      </van-radio-group>
      <div class="btn-wrap">
        <van-button round block type="success" :disabled="ordersLoading || !selectedOrderId" @click="goToQcForm">
          下一步
        </van-button>
      </div>
    </div>

    <div v-if="step === 1" class="step-content">
      <van-form @submit="goToUploadStep">
        <van-cell-group inset>
          <van-field name="inspectionType" label="检验类型">
            <template #input>
              <van-radio-group v-model="qcForm.inspectionType" direction="horizontal">
                <van-radio name="FAI">首件</van-radio>
                <van-radio name="IPQC">巡检</van-radio>
                <van-radio name="FQC">成品</van-radio>
                <van-radio name="IQC">来料</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field name="result" label="检验结果">
            <template #input>
              <van-radio-group v-model="qcForm.result" direction="horizontal" @change="onResultChange">
                <van-radio name="合格">合格</van-radio>
                <van-radio name="不合格">不合格</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field
            v-if="qcForm.result === '不合格'"
            v-model="qcForm.defectType"
            label="缺陷类型"
            placeholder="请输入缺陷类型"
            maxlength="50"
            :rules="[{ required: true, message: '请输入缺陷类型' }]"
          />
          <van-field
            v-if="qcForm.result === '不合格'"
            v-model="qcForm.defectDesc"
            label="缺陷描述"
            type="textarea"
            placeholder="请描述缺陷情况"
            rows="2"
            maxlength="500"
            show-word-limit
            :rules="[{ required: true, message: '请输入缺陷描述' }]"
          />
          <van-field
            v-model="qcForm.sampleCount"
            label="抽样数量"
            type="digit"
            placeholder="请输入抽样数量"
            :rules="[{ required: true, message: '请输入抽样数量' }]"
          />
        </van-cell-group>
        <div class="button-row">
          <van-button round block plain type="default" native-type="button" @click="step = 0">
            上一步
          </van-button>
          <van-button round block type="success" native-type="submit">
            下一步
          </van-button>
        </div>
      </van-form>
    </div>

    <div v-if="step === 2" class="step-content">
      <van-cell-group inset>
        <van-cell title="质检照片">
          <template #label>
            <van-uploader
              v-model="fileList"
              :max-count="4"
              :after-read="onAfterRead"
              multiple
            />
          </template>
        </van-cell>
      </van-cell-group>
      <van-notice-bar
        v-if="uploadBlockedText()"
        class="upload-warning"
        color="#ed6a0c"
        background="#fff7e8"
        :text="uploadBlockedText()"
      />
      <div class="button-row">
        <van-button round block plain type="default" :disabled="submitting" @click="step = 1">
          上一步
        </van-button>
        <van-button round block type="success" :loading="submitting" @click="onSubmit">
          提交质检
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getPendingQcOrders, submitQcRecord, uploadQcImage } from '../../api/qcRecord'
import { saveOfflineActionTask } from '../../utils/offline'
import {
  getQcUploadBlockingMessage,
  validateMobileQcRecordInput,
} from '../../utils/qc-record'

const router = useRouter()
const step = ref(0)
const selectedOrderId = ref<number>(0)
const selectedWorkOrder = ref<any>(null)
const orders = ref<any[]>([])
const ordersLoading = ref(false)
const submitting = ref(false)
const fileList = ref<any[]>([])

const qcForm = reactive({
  inspectionType: 'FAI',
  result: '合格',
  defectType: '',
  defectDesc: '',
  sampleCount: '',
})

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || res?.records || res || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

async function loadOrders() {
  ordersLoading.value = true
  try {
    const res = await getPendingQcOrders() as any
    orders.value = unwrapRecords(res)
    if (orders.value.length > 0) {
      selectOrder(orders.value[0])
    } else {
      selectedOrderId.value = 0
      selectedWorkOrder.value = null
    }
  } catch (error: any) {
    orders.value = []
    selectedOrderId.value = 0
    selectedWorkOrder.value = null
    showToast(error?.message || '待质检工单加载失败')
  } finally {
    ordersLoading.value = false
  }
}

function selectOrder(order: any) {
  selectedOrderId.value = Number(order.workOrderId || 0)
  selectedWorkOrder.value = order
}

function buildQcInput() {
  return {
    workOrderId: selectedOrderId.value,
    productId: selectedWorkOrder.value?.productId,
    inspectionType: qcForm.inspectionType,
    result: qcForm.result,
    defectType: qcForm.defectType,
    defectDesc: qcForm.defectDesc,
    sampleCount: qcForm.sampleCount,
  }
}

function goToQcForm() {
  if (!selectedOrderId.value) {
    showToast('请选择待质检工单')
    return
  }
  step.value = 1
}

function goToUploadStep() {
  const validationMessage = validateMobileQcRecordInput(buildQcInput())
  if (validationMessage) {
    showToast(validationMessage)
    return
  }
  step.value = 2
}

function onResultChange() {
  if (qcForm.result === '合格') {
    qcForm.defectType = ''
    qcForm.defectDesc = ''
  }
}

async function onAfterRead(file: any) {
  if (Array.isArray(file)) {
    for (const item of file) {
      await doUpload(item)
    }
    return
  }
  await doUpload(file)
}

async function doUpload(file: any) {
  file.status = 'uploading'
  file.message = '上传中...'
  try {
    const res = await uploadQcImage(file.file)
    const url = (res as any).data?.url || (res as any).url
    if (!url) throw new Error('上传未返回图片地址')
    file.status = 'done'
    file.message = ''
    file.url = url
  } catch (error: any) {
    file.status = 'failed'
    file.message = error?.message || '上传失败'
    showToast(file.message)
  }
}

function uploadBlockedText() {
  return getQcUploadBlockingMessage(fileList.value)
}

async function onSubmit() {
  if (submitting.value) return
  const validationMessage = validateMobileQcRecordInput(buildQcInput())
  if (validationMessage) {
    showToast(validationMessage)
    return
  }
  const uploadMessage = uploadBlockedText()
  if (uploadMessage) {
    showToast(uploadMessage)
    return
  }

  const images = fileList.value
    .filter((file) => file.status === 'done' && file.url)
    .map((file) => file.url)
  const payload = {
    workOrderId: selectedOrderId.value,
    productId: selectedWorkOrder.value?.productId,
    inspectionType: qcForm.inspectionType,
    result: qcForm.result,
    defectType: qcForm.defectType || undefined,
    defectDesc: qcForm.defectDesc || undefined,
    sampleCount: Number(qcForm.sampleCount),
    images,
  }

  submitting.value = true
  try {
    await submitQcRecord(payload)
    showToast('质检提交成功')
    router.back()
  } catch (error: any) {
    saveOfflineActionTask({
      source: 'qc',
      title: `质检 ${selectedWorkOrder.value?.workOrderNo || selectedOrderId.value}`,
      description: `${selectedWorkOrder.value?.productName || '待质检'} / ${qcForm.inspectionType}`,
      payload,
      last_error: error?.message || '提交失败',
    })
    showToast('提交失败，已保存到离线任务')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadOrders()
})
</script>

<style scoped lang="scss">
.qc-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.step-content {
  padding: 16px 0;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.btn-wrap {
  padding: 24px 32px;
}

.button-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  padding: 24px 24px;
}

.upload-warning {
  margin: 12px;
  border-radius: 8px;
}
</style>
