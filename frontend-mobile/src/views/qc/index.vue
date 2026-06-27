<template>
  <div class="qc-page">
    <van-nav-bar title="质检录入" left-arrow @click-left="router.back()" />

    <!-- 步骤条 -->
    <van-steps :active="step" active-color="#07c160">
      <van-step>选择工单</van-step>
      <van-step>录入质检</van-step>
      <van-step>拍照提交</van-step>
    </van-steps>

    <!-- 第一步：选择工单 -->
    <div v-if="step === 0" class="step-content">
      <van-empty v-if="orders.length === 0" description="暂无待质检工单" />
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
        <van-button round block type="success" :disabled="!selectedOrderId" @click="step = 1">
          下一步
        </van-button>
      </div>
    </div>

    <!-- 第二步：录入质检 -->
    <div v-if="step === 1" class="step-content">
      <van-form @submit="step = 2">
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
              <van-radio-group v-model="qcForm.result" direction="horizontal">
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
          />
          <van-field
            v-if="qcForm.result === '不合格'"
            v-model="qcForm.defectDesc"
            label="缺陷描述"
            type="textarea"
            placeholder="请描述缺陷情况"
            rows="2"
          />
          <van-field
            v-model="qcForm.sampleCount"
            label="抽样数量"
            type="digit"
            placeholder="请输入抽样数量"
            :rules="[{ required: true, message: '请输入抽样数量' }]"
          />
        </van-cell-group>
        <div class="btn-wrap">
          <van-button round block type="success" native-type="submit">
            下一步
          </van-button>
        </div>
      </van-form>
    </div>

    <!-- 第三步：拍照提交 -->
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
      <div class="btn-wrap">
        <van-button round block type="success" :loading="submitting" @click="onSubmit">
          提交质检
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getPendingQcOrders, submitQcRecord, uploadQcImage } from '../../api/qcRecord'

const router = useRouter()
const step = ref(0)
const selectedOrderId = ref<number>(0)
const selectedWorkOrder = ref<any>(null)
const orders = ref<any[]>([])
const submitting = ref(false)
const fileList = ref<any[]>([])

const qcForm = reactive({
  inspectionType: 'FAI',
  result: '合格',
  defectType: '',
  defectDesc: '',
  sampleCount: '',
})

/** 加载待质检工单 */
async function loadOrders() {
  try {
    const res = await getPendingQcOrders() as any
    orders.value = res.data || res || []
    if (orders.value.length > 0) {
      selectedOrderId.value = orders.value[0].workOrderId
      selectedWorkOrder.value = orders.value[0]
    }
  } catch {
    orders.value = []
  }
}

function selectOrder(order: any) {
  selectedOrderId.value = order.workOrderId
  selectedWorkOrder.value = order
}

/** 上传照片回调 */
async function onAfterRead(file: any) {
  if (Array.isArray(file)) {
    for (const f of file) {
      await doUpload(f)
    }
  } else {
    await doUpload(file)
  }
}

/** 执行上传 */
async function doUpload(file: any) {
  file.status = 'uploading'
  try {
    const res = await uploadQcImage(file.file)
    file.status = 'done'
    file.url = (res as any).data?.url || (res as any).url
  } catch {
    file.status = 'failed'
    showToast('上传失败')
  }
}

/** 提交质检 */
async function onSubmit() {
  submitting.value = true
  try {
    const images = fileList.value
      .filter((f) => f.status === 'done' && f.url)
      .map((f) => f.url)

    await submitQcRecord({
      workOrderId: selectedOrderId.value,
      productId: selectedWorkOrder.value?.productId,
      inspectionType: qcForm.inspectionType,
      result: qcForm.result,
      defectType: qcForm.defectType || undefined,
      defectDesc: qcForm.defectDesc || undefined,
      sampleCount: Number(qcForm.sampleCount),
      images,
    })
    showToast('质检提交成功')
    router.back()
  } catch {
    showToast('提交失败')
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

.btn-wrap {
  padding: 24px 32px;
}
</style>
