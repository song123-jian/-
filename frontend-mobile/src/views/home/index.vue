<template>
  <div class="home-page">
    <!-- 顶部用户信息 -->
    <div class="user-header">
      <div class="user-info">
        <van-icon name="manager" size="40" color="#fff" />
        <div class="user-detail">
          <span class="user-name">{{ userStore.userName || '操作员' }}</span>
          <span class="user-shift">当前班次：{{ userStore.shift }}</span>
        </div>
      </div>
      <van-badge :content="unreadCount" :max="99" :offset="[-2, 2]">
        <van-icon name="bell" size="22" color="#fff" @click="goNotifications" />
      </van-badge>
    </div>

    <!-- 快捷入口 -->
    <div class="quick-entry">
      <van-grid :column-num="4" :border="false">
        <van-grid-item icon="scan" text="扫码报工" @click="goTo('/m/report')" />
        <van-grid-item icon="chart-trending-o" text="我的产量" @click="goTo('/m/my-output')" />
        <van-grid-item icon="gold-coin-o" text="我的工资" @click="goTo('/m/my-salary')" />
        <van-grid-item icon="checked" text="质检录入" @click="goTo('/m/qc')" />
      </van-grid>
    </div>

    <!-- 当班任务列表 -->
    <div class="task-section">
      <div class="section-title">当班任务</div>
      <van-empty v-if="tasks.length === 0" description="暂无当班任务" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="task in tasks"
          :key="task.workOrderId"
          :title="task.productName"
          :label="task.workOrderNo"
          is-link
          @click="goTo('/m/report')"
        >
          <template #value>
            <van-tag type="primary">{{ task.machineCode }}</van-tag>
          </template>
        </van-cell>
      </van-cell-group>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../store/user'
import { getCurrentShiftTasks } from '../../api/prodReport'
import { getUnreadCount } from '../../api/notification'

const router = useRouter()
const userStore = useUserStore()
const activeTab = ref(0)
const unreadCount = ref(0)

/** 当班任务列表 */
const tasks = ref<any[]>([])

/** 加载当班任务 */
async function loadTasks() {
  try {
    const res = await getCurrentShiftTasks() as any
    tasks.value = res.data || res || []
  } catch {
    tasks.value = []
  }
}

/** 加载未读消息数 */
async function loadUnreadCount() {
  try {
    const res = await getUnreadCount() as any
    const count = res.data ?? res
    unreadCount.value = Number(count) || 0
  } catch {
    unreadCount.value = 0
  }
}

/** 跳转页面 */
function goTo(path: string) {
  router.push(path)
}

/** 跳转通知页 */
function goNotifications() {
  router.push('/m/notifications')
}

onMounted(() => {
  loadTasks()
  loadUnreadCount()
})
</script>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 60px;
}

.user-header {
  background: linear-gradient(135deg, #1989fa, #07c160);
  padding: 20px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-detail {
  color: #fff;
  display: flex;
  flex-direction: column;

  .user-name {
    font-size: 16px;
    font-weight: bold;
  }

  .user-shift {
    font-size: 12px;
    opacity: 0.8;
    margin-top: 4px;
  }
}

.quick-entry {
  margin: -20px 12px 12px;
  background: #fff;
  border-radius: 12px;
  padding: 12px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.task-section {
  padding: 0 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
  padding-left: 4px;
}
</style>
