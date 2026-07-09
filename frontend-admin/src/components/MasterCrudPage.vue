<template>
  <div class="page-container master-page">
    <PageHeader :title="title" :subtitle="subtitle">
      <template #default>
        <slot name="toolbar" />
      </template>
    </PageHeader>

    <MetricStrip
      v-if="showMetrics && metrics.length > 0"
      class="kpi-strip"
      :items="metrics"
      testid="master-metric-strip"
    />

    <slot name="search" />

    <el-row :gutter="16" class="content-row">
      <el-col :span="leftSpan">
        <slot name="table" />
      </el-col>
      <el-col :span="rightSpan">
        <slot name="detail" />
      </el-col>
    </el-row>

    <slot />
  </div>
</template>

<script setup lang="ts">
import MetricStrip from './MetricStrip.vue'
import PageHeader from './PageHeader.vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    metrics?: Array<{ label: string; value: string | number }>
    leftSpan?: number
    rightSpan?: number
    showMetrics?: boolean
  }>(),
  {
    metrics: () => [],
    leftSpan: 16,
    rightSpan: 8,
    showMetrics: true,
  },
)
</script>

<style scoped lang="scss">
.master-page {
  gap: 16px;
}

.content-row {
  align-items: flex-start;
}

.kpi-strip {
  margin-bottom: 2px;
}

:deep(.pagination) {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

:deep(.side-card) {
  min-height: 100%;
}

:deep(.detail-list) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:deep(.detail-item) {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef1f4;
}

:deep(.detail-item span) {
  color: #6b7280;
}
</style>
