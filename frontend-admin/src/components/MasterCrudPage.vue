<template>
  <div class="page-container master-page">
    <PageHeader :title="title">
      <template #default>
        <slot name="toolbar" />
      </template>
    </PageHeader>

    <section v-if="showMetrics && metrics.length > 0" class="kpi-strip">
      <article v-for="item in metrics" :key="item.label" class="kpi-card">
        <div class="kpi-title">{{ item.label }}</div>
        <div class="kpi-value">{{ item.value }}</div>
      </article>
    </section>

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
import PageHeader from './PageHeader.vue'

withDefaults(
  defineProps<{
    title: string
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

:deep(.pagination) {
  margin-top: 16px;
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
