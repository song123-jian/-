<template>
  <div class="my-output-page">
    <van-nav-bar title="我的产量" left-arrow @click-left="router.back()" />

    <!-- Tab切换：当日/当月 -->
    <van-tabs v-model:active="activeTab" @change="onTabChange">
      <van-tab title="当日" name="day" />
      <van-tab title="当月" name="month" />
    </van-tabs>

    <!-- 产量统计卡片 -->
    <div class="stats-cards">
      <div class="stat-card">
        <span class="stat-value">{{ stats.totalQuantity }}</span>
        <span class="stat-label">总产量</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.totalDefect }}</span>
        <span class="stat-label">不良数</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.reportCount }}</span>
        <span class="stat-label">报工次数</span>
      </div>
    </div>

    <!-- 报工记录列表 -->
    <div class="record-section">
      <div class="section-title">报工记录</div>
      <van-empty v-if="records.length === 0" description="暂无报工记录" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="record in records"
          :key="record.id"
          :title="record.productName"
          :label="`${record.workOrderNo} · ${record.createdAt || record.reportTime || ''}`"
        >
          <template #value>
            <div class="record-value">
              <span class="quantity">{{ record.quantity }}</span>
              <span class="defect" v-if="record.defectCount > 0">
                不良{{ record.defectCount }}
              </span>
            </div>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 底部导航栏 -->
    <van-tabbar v-model="tabbarActive" route>
      <van-tabbar-item icon="home-o" to="/m/home">首页</van-tabbar-item>
      <van-tabbar-item icon="scan" to="/m/report">报工</van-tabbar-item>
      <van-tabbar-item icon="chart-trending-o" to="/m/my-output">产量</van-tabbar-item>
      <van-tabbar-item icon="contact" to="/m/my-salary">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getMyReports, getMyOutputStats } from '../../api/prodReport'

const router = useRouter()
const activeTab = ref<string | number>('day')
const tabbarActive = ref(2)

const stats = reactive({
  totalQuantity: 0,
  totalDefect: 0,
  reportCount: 0,
})

const records = ref<any[]>([])

/** 加载数据 */
async function loadData() {
  try {
    const [statsRes, recordsRes] = await Promise.all([
      getMyOutputStats({ type: activeTab.value as 'day' | 'month' }),
      getMyReports({ type: activeTab.value as 'day' | 'month', page: 1, size: 50 }),
    ])
    const statsData = (statsRes as any).data || statsRes || {}
    stats.totalQuantity = statsData.totalQuantity || 0
    stats.totalDefect = statsData.totalDefect || 0
    stats.reportCount = statsData.reportCount || 0

    records.value = (recordsRes as any).data?.records || (recordsRes as any).data || []
  } catch {
    // 静默处理
  }
}

/** Tab切换 */
function onTabChange() {
  loadData()
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
.my-output-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 60px;
}

.stats-cards {
  display: flex;
  padding: 16px 12px;
  gap: 12px;
}

.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .stat-value {
    display: block;
    font-size: 24px;
    font-weight: bold;
    color: #1989fa;
  }

  .stat-label {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }
}

.record-section {
  padding: 0 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
  padding-left: 4px;
}

.record-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  .quantity {
    font-size: 16px;
    font-weight: bold;
    color: #333;
  }

  .defect {
    font-size: 12px;
    color: #ee0a24;
    margin-top: 2px;
  }
}
</style>
