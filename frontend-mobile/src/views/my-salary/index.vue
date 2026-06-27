<template>
  <div class="my-salary-page">
    <van-nav-bar title="我的工资" left-arrow @click-left="router.back()" />

    <!-- 当月工资汇总 -->
    <div class="salary-summary">
      <div class="summary-header">
        <span class="summary-month">{{ currentMonth }}</span>
        <span class="summary-label">当月工资</span>
      </div>
      <div class="summary-amount">
        ¥{{ summary.totalAmount.toFixed(2) }}
      </div>
      <div class="summary-detail">
        <div class="detail-item">
          <span class="detail-label">计件工资</span>
          <span class="detail-value">¥{{ summary.pieceAmount.toFixed(2) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">加班工资</span>
          <span class="detail-value">¥{{ summary.overtimeAmount.toFixed(2) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">基本工资</span>
          <span class="detail-value">¥{{ summary.baseSalary.toFixed(2) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">扣款</span>
          <span class="detail-value deduction">-¥{{ summary.deduction.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <!-- 日工资明细 -->
    <div class="daily-section">
      <div class="section-title">日工资明细</div>
      <van-empty v-if="dailyList.length === 0" description="暂无明细" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="item in dailyList"
          :key="item.date"
          :title="item.date"
          :label="`计件${item.pieceCount}件 · 加班${item.overtimeHours}h`"
        >
          <template #value>
            <span class="daily-amount">¥{{ item.dailyTotal.toFixed(2) }}</span>
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
import dayjs from 'dayjs'
import { useUserStore } from '../../store/user'
import { getSalarySummary, getDailySalaryDetails } from '../../api/salary'

const router = useRouter()
const userStore = useUserStore()
const tabbarActive = ref(3)

const now = dayjs()
const currentMonth = now.format('YYYY年M月')

const summary = reactive({
  baseSalary: 0,
  pieceAmount: 0,
  overtimeAmount: 0,
  deduction: 0,
  totalAmount: 0,
})

const dailyList = ref<any[]>([])

/** 加载工资数据 */
async function loadData() {
  try {
    const [summaryRes, dailyRes] = await Promise.all([
      getSalarySummary({ year: now.year(), month: now.month() + 1, userId: userStore.userId || undefined }),
      getDailySalaryDetails({ year: now.year(), month: now.month() + 1, userId: userStore.userId || undefined }),
    ])
    const summaryData = (summaryRes as any).data || summaryRes || {}
    summary.baseSalary = summaryData.baseSalary || 0
    summary.pieceAmount = summaryData.pieceAmount || 0
    summary.overtimeAmount = summaryData.overtimeAmount || 0
    summary.deduction = summaryData.deduction || 0
    summary.totalAmount = summaryData.totalAmount || 0

    dailyList.value = (dailyRes as any).data || dailyRes || []
  } catch {
    // 静默处理
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
.my-salary-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 60px;
}

.salary-summary {
  background: linear-gradient(135deg, #1989fa, #4fc3f7);
  padding: 20px 16px;
  color: #fff;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  .summary-month {
    font-size: 16px;
    font-weight: bold;
  }

  .summary-label {
    font-size: 12px;
    opacity: 0.8;
  }
}

.summary-amount {
  font-size: 36px;
  font-weight: bold;
  margin-bottom: 16px;
}

.summary-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-item {
  flex: 1;
  min-width: 45%;
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;

  .detail-label {
    opacity: 0.8;
  }

  .detail-value {
    font-weight: 500;
  }

  .deduction {
    color: #ffcdd2;
  }
}

.daily-section {
  padding: 16px 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
  padding-left: 4px;
}

.daily-amount {
  font-size: 16px;
  font-weight: bold;
  color: #1989fa;
}
</style>
