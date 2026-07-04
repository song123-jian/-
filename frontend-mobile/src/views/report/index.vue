<template>
  <div class="report-page">
    <van-nav-bar title="扫码报工" left-arrow @click-left="onBack" />

    <!-- 步骤条 -->
    <van-steps :active="step" active-color="#1989fa">
      <van-step>扫码/选机台</van-step>
      <van-step>选择工单</van-step>
      <van-step>报工提交</van-step>
    </van-steps>

    <!-- 第一步：扫码/选机台 -->
    <div v-if="step === 0" class="step-content">
      <van-cell-group inset>
        <van-field
          v-model="machineCode"
          label="机台编号"
          placeholder="扫码或手动输入机台编号"
          clearable
        >
          <template #button>
            <van-button size="small" type="primary" @click="onScan">扫码</van-button>
          </template>
        </van-field>
      </van-cell-group>
      <div class="btn-wrap">
        <van-button round block type="primary" :disabled="!machineCode" @click="loadWorkOrders">
          下一步
        </van-button>
      </div>
    </div>

    <!-- 第二步：选择工单 -->
    <div v-if="step === 1" class="step-content">
      <van-empty v-if="workOrders.length === 0" description="未找到相关工单" />
      <van-radio-group v-else v-model="selectedOrderId">
        <van-cell-group inset>
          <van-cell
            v-for="order in workOrders"
            :key="order.workOrderId"
            :title="order.productName"
            :label="order.workOrderNo"
            clickable
            @click="selectWorkOrder(order)"
          >
            <template #right-icon>
              <van-radio :name="order.workOrderId" />
            </template>
          </van-cell>
        </van-cell-group>
      </van-radio-group>
      <div class="btn-wrap">
        <van-button round block type="primary" :disabled="!selectedOrderId" @click="step = 2">
          下一步
        </van-button>
      </div>
    </div>

    <!-- 第三步：报工表单 -->
    <div v-if="step === 2" class="step-content">
      <van-form @submit="onSubmitReport">
        <van-cell-group inset>
          <van-cell title="机台编号" :value="machineCode" />
          <van-cell title="工单" :value="selectedWorkOrder?.workOrderNo || ''" />
          <van-field
            v-model.trim="reportForm.processName"
            name="processName"
            label="工序"
            maxlength="50"
            placeholder="请输入工序名称"
            :rules="[{ validator: validateProcessName }]"
          />
          <van-field name="shift" label="班次">
            <template #input>
              <van-radio-group v-model="reportForm.shift" direction="horizontal">
                <van-radio name="DAY">白班</van-radio>
                <van-radio name="NIGHT">夜班</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field
            v-model="reportForm.quantity"
            name="quantity"
            label="产量"
            type="digit"
            placeholder="请输入产量"
            :rules="[{ required: true, message: '请输入产量' }]"
          />
          <van-field
            v-model="reportForm.defectCount"
            name="defectCount"
            label="不良数"
            type="digit"
            placeholder="请输入不良数"
          />
          <van-field
            v-model="reportForm.moldCount"
            name="moldCount"
            label="模次"
            type="digit"
            placeholder="请输入模次"
          />
        </van-cell-group>
        <div class="btn-wrap">
          <van-button round block type="primary" native-type="submit" :loading="submitting">
            提交报工
          </van-button>
        </div>
      </van-form>
    </div>

    <!-- 底部导航栏 -->
    <van-tabbar v-model="activeTab" route>
      <van-tabbar-item icon="home-o" to="/m/home">首页</van-tabbar-item>
      <van-tabbar-item icon="scan" to="/m/report">报工</van-tabbar-item>
      <van-tabbar-item icon="chart-trending-o" to="/m/my-output">产量</van-tabbar-item>
      <van-tabbar-item icon="contact" to="/m/my-salary">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getWorkOrdersByMachine, submitReport } from '../../api/prodReport'
import { saveOfflineReport } from '../../utils/offline'
import { normalizeMobileReportProcessName, validateMobileReportProcessName } from '../../utils/production-report'

const router = useRouter()
const activeTab = ref(1)
const step = ref(0)
const machineCode = ref('')
const selectedOrderId = ref<number>(0)
const selectedWorkOrder = ref<any>(null)
const workOrders = ref<any[]>([])
const submitting = ref(false)

const reportForm = reactive({
  processName: '注塑',
  shift: 'DAY',
  quantity: '',
  defectCount: '',
  moldCount: '',
})

/** 返回上一页 */
function onBack() {
  if (step.value > 0) {
    step.value--
  } else {
    router.back()
  }
}

function validateProcessName(value: string) {
  return validateMobileReportProcessName(value) || true
}

/** 扫码（调用摄像头或外部扫码器） */
function onScan() {
  // 实际项目中可集成扫码SDK
  showToast('请使用扫码枪扫描机台条码')
}

/** 加载工单列表 */
async function loadWorkOrders() {
  try {
    const res = await getWorkOrdersByMachine(machineCode.value) as any
    workOrders.value = res.data || res || []
    if (workOrders.value.length > 0) {
      step.value = 1
      selectedOrderId.value = workOrders.value[0].workOrderId
      selectedWorkOrder.value = workOrders.value[0]
    } else {
      showToast('未找到相关工单')
    }
  } catch {
    showToast('获取工单失败')
  }
}

/** 选择工单 */
function selectWorkOrder(order: any) {
  selectedOrderId.value = order.workOrderId
  selectedWorkOrder.value = order
}

watch(selectedOrderId, (id) => {
  const matched = workOrders.value.find((item) => item.workOrderId === id)
  if (matched) {
    selectedWorkOrder.value = matched
  }
})

/** 提交报工 */
async function onSubmitReport() {
  submitting.value = true
  const params = {
    workOrderId: selectedOrderId.value,
    machineId: selectedWorkOrder.value?.machineId || 0,
    processName: normalizeMobileReportProcessName(reportForm.processName),
    shift: reportForm.shift,
    quantity: Number(reportForm.quantity),
    defectCount: Number(reportForm.defectCount) || 0,
    moldCount: Number(reportForm.moldCount) || 0,
  }

  try {
    await submitReport(params)
    showToast('报工成功')
    // 重置表单
    step.value = 0
    machineCode.value = ''
    selectedOrderId.value = 0
    selectedWorkOrder.value = null
    workOrders.value = []
    reportForm.processName = '注塑'
    reportForm.quantity = ''
    reportForm.defectCount = ''
    reportForm.moldCount = ''
  } catch {
    // 网络异常时保存到离线数据库
    try {
      await saveOfflineReport(params)
      showToast('网络异常，已保存到本地，联网后自动同步')
    } catch {
      showToast('报工失败')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.report-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 60px;
}

.step-content {
  padding: 16px 0;
}

.btn-wrap {
  padding: 24px 32px;
}
</style>
