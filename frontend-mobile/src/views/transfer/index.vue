<template>
  <div class="transfer-page">
    <van-nav-bar title="调拨扫码" left-arrow @click-left="router.back()" />

    <!-- 扫码输入 -->
    <van-cell-group inset class="scan-group">
      <van-field
        v-model="transferCode"
        label="调拨单号"
        placeholder="扫码或输入调拨单号"
        clearable
      >
        <template #button>
          <van-button size="small" type="primary" @click="onScan">扫码</van-button>
        </template>
      </van-field>
      <div class="scan-btn-wrap">
        <van-button round block type="primary" :disabled="!transferCode" @click="onQuery">
          查询调拨单
        </van-button>
      </div>
    </van-cell-group>

    <!-- 调拨信息 -->
    <template v-if="transferInfo">
      <van-cell-group inset title="调拨信息">
        <van-cell title="调拨单号" :value="transferInfo.transferNo" />
        <van-cell title="调出仓" :value="transferInfo.fromWarehouseName" />
        <van-cell title="调入仓" :value="transferInfo.toWarehouseName" />
        <van-cell title="状态" :value="transferInfo.status" />
      </van-cell-group>

      <van-cell-group v-if="transferInfo.items?.length" inset title="调拨明细" style="margin-top: 12px">
        <van-cell
          v-for="item in transferInfo.items"
          :key="item.id"
          :title="item.productName"
          :label="`${item.fromLocationCode || '-'} → ${item.toLocationCode || '-'} · ${item.qty}`"
        />
      </van-cell-group>

      <div class="action-btns">
        <van-button round block type="success" @click="onConfirm" :loading="loading">
          确认收货
        </van-button>
      </div>
    </template>

    <!-- 待处理调拨列表 -->
    <div class="pending-section">
      <div class="section-title">待处理调拨</div>
      <van-empty v-if="pendingList.length === 0" description="暂无待处理调拨" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="item in pendingList"
          :key="item.id"
          :title="item.transferNo"
          :label="`${item.fromWarehouseName || '-'} → ${item.toWarehouseName || '-'}`"
          is-link
          @click="onSelectPending(item)"
        />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getTransferByCode, confirmTransfer, getPendingTransfers } from '../../api/stock'

const router = useRouter()
const transferCode = ref('')
const transferInfo = ref<any>(null)
const loading = ref(false)
const pendingList = ref<any[]>([])

/** 扫码 */
function onScan() {
  showToast('请使用扫码枪扫描调拨单条码')
}

/** 查询调拨单 */
async function onQuery() {
  try {
    const res = await getTransferByCode(transferCode.value) as any
    const records = res.data?.records || res.data || res || []
    transferInfo.value = Array.isArray(records) ? records[0] || null : records
    if (!transferInfo.value) {
      showToast('未找到调拨单')
    }
  } catch {
    showToast('查询失败')
    transferInfo.value = null
  }
}

/** 确认/拒绝调拨 */
async function onConfirm() {
  try {
    await showConfirmDialog({ title: '确认收货', message: '确定要确认收货吗？' })
  } catch {
    return
  }

  loading.value = true
  try {
    await confirmTransfer({
      transferId: transferInfo.value.id,
    })
    showToast('确认收货成功')
    transferInfo.value = null
    transferCode.value = ''
    loadPendingList()
  } catch {
    showToast('操作失败')
  } finally {
    loading.value = false
  }
}

/** 选择待处理调拨 */
function onSelectPending(item: any) {
  transferCode.value = item.transferNo
  transferInfo.value = item
}

/** 加载待处理调拨列表 */
async function loadPendingList() {
  try {
    const res = await getPendingTransfers() as any
    const records = res.data?.records || res.data || res || []
    pendingList.value = Array.isArray(records)
      ? records.filter((item) => item.status === 'SHIPPED')
      : []
  } catch {
    pendingList.value = []
  }
}

onMounted(() => {
  loadPendingList()
})
</script>

<style scoped lang="scss">
.transfer-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.scan-group {
  margin-top: 8px;
}

.scan-btn-wrap {
  padding: 16px;
}

.action-btns {
  padding: 16px 32px;
}

.pending-section {
  padding: 16px 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
  padding-left: 4px;
}
</style>
