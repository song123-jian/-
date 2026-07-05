<template>
  <div class="offline-page">
    <van-nav-bar title="离线任务" left-arrow @click-left="router.back()" />

    <div class="summary-grid">
      <div class="summary-item danger">
        <span>失败</span>
        <strong>{{ center.summary.failed }}</strong>
      </div>
      <div class="summary-item warning">
        <span>待同步</span>
        <strong>{{ center.summary.pending }}</strong>
      </div>
      <div class="summary-item">
        <span>可重试</span>
        <strong>{{ center.summary.retryable }}</strong>
      </div>
    </div>

    <div class="action-row">
      <van-button size="small" plain type="primary" :loading="loading" @click="loadTasks">刷新</van-button>
      <van-button size="small" type="primary" :loading="syncing" :disabled="!center.summary.retryable" @click="syncAll">同步全部</van-button>
    </div>

    <van-empty v-if="!center.tasks.length && !loading" description="暂无离线任务" />
    <van-loading v-if="loading" class="page-loading" type="spinner">加载中...</van-loading>
    <van-cell-group v-else inset>
      <van-cell
        v-for="task in center.tasks"
        :key="task.id"
        :title="task.title"
        :label="task.description"
      >
        <template #value>
          <div class="task-value">
            <van-tag :type="statusTagType(task.syncStatus)" plain>
              {{ getOfflineTaskStatusText(task.syncStatus) }}
            </van-tag>
            <van-button
              v-if="task.canRetry"
              size="mini"
              type="primary"
              plain
              :loading="syncing"
              @click.stop="retryTask(task)"
            >
              重试
            </van-button>
          </div>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  buildOfflineTaskCenter,
  getOfflineTaskStatusText,
  type MobileOfflineTask,
} from '../../utils/offline-task-center'
import {
  getActionableOfflineActionTasks,
  getActionableOfflineReports,
  retryOfflineActionTask,
  retryOfflineReport,
  syncOfflineActionTasks,
  syncOfflineReports,
  type SyncStatus,
} from '../../utils/offline'

const router = useRouter()
const loading = ref(false)
const syncing = ref(false)
const reports = ref<any[]>([])
const actionTasks = ref<any[]>([])
const center = computed(() => buildOfflineTaskCenter(reports.value, actionTasks.value))

function statusTagType(value: SyncStatus) {
  if (value === 'failed') return 'danger'
  if (value === 'pending') return 'warning'
  if (value === 'syncing') return 'primary'
  return 'success'
}

async function loadTasks() {
  loading.value = true
  try {
    reports.value = await getActionableOfflineReports()
    actionTasks.value = getActionableOfflineActionTasks()
  } catch (error: any) {
    reports.value = []
    actionTasks.value = []
    showToast(error?.message || '离线任务加载失败')
  } finally {
    loading.value = false
  }
}

async function retryTask(task: MobileOfflineTask) {
  syncing.value = true
  try {
    if (task.source === 'report') {
      const id = Number(task.payload.id || 0)
      if (!id) {
        showToast('离线任务编号无效')
        return
      }
      await retryOfflineReport(id)
      await syncOfflineReports()
    } else {
      retryOfflineActionTask(task.id)
      await syncOfflineActionTasks()
    }
    await loadTasks()
    showToast('重试已触发')
  } catch (error: any) {
    showToast(error?.message || '重试失败')
  } finally {
    syncing.value = false
  }
}

async function syncAll() {
  syncing.value = true
  try {
    for (const task of center.value.tasks.filter((item) => item.canRetry)) {
      if (task.source === 'report') {
        const id = Number(task.payload.id || 0)
        if (id) await retryOfflineReport(id)
      } else {
        retryOfflineActionTask(task.id)
      }
    }
    const [reportResult, actionResult] = await Promise.all([syncOfflineReports(), syncOfflineActionTasks()])
    await loadTasks()
    showToast(`同步完成：成功 ${reportResult.success + actionResult.success}，失败 ${reportResult.failed + actionResult.failed}`)
  } catch (error: any) {
    showToast(error?.message || '同步失败')
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  loadTasks()
})
</script>

<style scoped lang="scss">
.offline-page {
  min-height: 100vh;
  background: #eef2f6;
  padding-bottom: 24px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.summary-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #fff;
  display: grid;
  gap: 4px;

  span {
    color: #526071;
    font-size: 12px;
  }

  strong {
    color: #1f2933;
    font-size: 22px;
    line-height: 1.2;
  }

  &.danger strong {
    color: #dc2626;
  }

  &.warning strong {
    color: #d97706;
  }
}

.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 12px 12px;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.task-value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
</style>
