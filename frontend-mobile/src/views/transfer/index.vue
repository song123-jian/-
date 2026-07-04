<template>
  <div class="transfer-page">
    <van-nav-bar title="调拨扫码" left-arrow @click-left="router.back()" />

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
        <van-button
          round
          block
          type="primary"
          :loading="queryLoading"
          :disabled="!transferCode.trim()"
          @click="onQuery"
        >
          查询调拨单
        </van-button>
      </div>
    </van-cell-group>

    <template v-if="transferInfo">
      <van-cell-group inset title="调拨信息">
        <van-cell title="调拨单号" :value="transferInfo.transferNo" />
        <van-cell title="调出仓" :value="transferInfo.fromWarehouseName" />
        <van-cell title="调入仓" :value="transferInfo.toWarehouseName" />
        <van-cell title="状态" :value="transferStatusText(transferInfo)" />
        <van-cell title="调拨数量" :value="`${transferInfo.remainingQty || 0} / ${transferInfo.totalQty || 0}`" />
      </van-cell-group>

      <van-notice-bar
        v-if="receiveBlockedText(transferInfo)"
        class="receive-warning"
        color="#ed6a0c"
        background="#fff7e8"
        :text="receiveBlockedText(transferInfo)"
      />

      <van-cell-group v-if="transferInfo.items?.length" inset title="调拨明细" class="detail-group">
        <van-cell
          v-for="item in transferInfo.items"
          :key="item.id"
          :title="item.productName"
          :label="transferItemLabel(item)"
        >
          <template #value>
            <span class="item-qty">{{ item.receivedQty || 0 }}/{{ item.qty || 0 }}</span>
          </template>
        </van-cell>
      </van-cell-group>

      <div class="action-btns">
        <van-button
          round
          block
          type="success"
          :disabled="!canReceiveTransfer(transferInfo)"
          :loading="loading"
          @click="onConfirm"
        >
          确认收货
        </van-button>
      </div>
    </template>

    <div class="pending-section">
      <div class="section-title">待处理调拨</div>
      <van-loading v-if="pendingLoading" class="pending-loading" type="spinner">加载中...</van-loading>
      <van-empty v-else-if="pendingList.length === 0" description="暂无待处理调拨" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="item in pendingList"
          :key="item.id"
          :title="item.transferNo"
          :label="`${item.fromWarehouseName || '-'} → ${item.toWarehouseName || '-'} · 待收 ${item.remainingQty || 0}`"
          :value="transferStatusText(item)"
          is-link
          @click="onSelectPending(item)"
        />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { confirmTransfer, getPendingTransfers, getTransferByCode } from '../../api/stock'
import {
  getStockTransferStatusText,
  transferItemTraceLabel,
  validateStockTransferReceive,
} from '../../utils/stock-transfer'

const router = useRouter()
const transferCode = ref('')
const transferInfo = ref<any>(null)
const loading = ref(false)
const queryLoading = ref(false)
const pendingLoading = ref(false)
const pendingList = ref<any[]>([])

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || res?.records || res || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function transferStatusText(row: any) {
  return row?.statusText || getStockTransferStatusText(row?.status)
}

function receiveBlockedText(row: any) {
  return validateStockTransferReceive(row)
}

function canReceiveTransfer(row: any) {
  return !receiveBlockedText(row)
}

function transferItemLabel(item: any) {
  return transferItemTraceLabel(item)
}

function onScan() {
  showToast('请使用扫码枪扫描调拨单条码')
}

async function onQuery() {
  const code = transferCode.value.trim()
  if (!code) {
    showToast('请输入调拨单号')
    return
  }
  queryLoading.value = true
  try {
    const res = await getTransferByCode(code) as any
    const records = unwrapRecords(res)
    transferInfo.value = records.find((item) => item.transferNo === code) || records[0] || null
    if (!transferInfo.value) {
      showToast('未找到调拨单')
      return
    }
    const blocked = receiveBlockedText(transferInfo.value)
    if (blocked) showToast(blocked)
  } catch (error: any) {
    showToast(error?.message || '查询失败')
    transferInfo.value = null
  } finally {
    queryLoading.value = false
  }
}

async function onConfirm() {
  const blocked = receiveBlockedText(transferInfo.value)
  if (blocked) {
    showToast(blocked)
    return
  }
  try {
    await showConfirmDialog({ title: '确认收货', message: '确定要确认该调拨单收货吗？' })
  } catch {
    return
  }

  loading.value = true
  try {
    await confirmTransfer({
      transferId: Number(transferInfo.value.id),
    })
    showToast('确认收货成功')
    transferInfo.value = null
    transferCode.value = ''
    await loadPendingList()
  } catch (error: any) {
    showToast(error?.message || '操作失败')
  } finally {
    loading.value = false
  }
}

function onSelectPending(item: any) {
  transferCode.value = item.transferNo
  transferInfo.value = item
}

async function loadPendingList() {
  pendingLoading.value = true
  try {
    const res = await getPendingTransfers() as any
    pendingList.value = unwrapRecords(res).filter((item) => canReceiveTransfer(item))
  } catch (error: any) {
    pendingList.value = []
    showToast(error?.message || '待处理调拨加载失败')
  } finally {
    pendingLoading.value = false
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

.receive-warning {
  margin: 12px;
  border-radius: 8px;
}

.detail-group {
  margin-top: 12px;
}

.item-qty {
  font-size: 15px;
  font-weight: 600;
  color: #07c160;
}

.action-btns {
  padding: 16px 32px;
}

.pending-section {
  padding: 16px 12px;
}

.pending-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
  padding-left: 4px;
}
</style>
