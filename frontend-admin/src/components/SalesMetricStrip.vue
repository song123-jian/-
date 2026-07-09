<template>
  <section class="sales-metric-strip" data-testid="sales-metric-strip">
    <article v-for="item in metrics" :key="item.label" class="sales-metric-card" :class="`is-${item.tone || 'default'}`">
      <div class="sales-metric-card__label">{{ item.label }}</div>
      <div class="sales-metric-card__value">{{ valueText(item) }}</div>
      <div v-if="item.meta" class="sales-metric-card__meta">{{ item.meta }}</div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils'
import type { SalesMetricCard } from '@/utils/sale-management'

defineProps<{
  metrics: SalesMetricCard[]
}>()

function valueText(item: SalesMetricCard) {
  if (item.valueType === 'money') return formatMoney(Number(item.value || 0))
  const value = Number(item.value || 0)
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('zh-CN')
}
</script>

<style scoped lang="scss">
.sales-metric-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
  gap: 12px;
}

.sales-metric-card {
  min-height: 104px;
  padding: 14px;
  border: 1px solid var(--ui-color-border);
  border-left: 4px solid var(--ui-color-neutral);
  border-radius: var(--ui-radius-card);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);

  &.is-success {
    border-left-color: var(--ui-color-success);
  }

  &.is-warning {
    border-left-color: var(--ui-color-warning);
  }

  &.is-danger {
    border-left-color: var(--ui-color-danger);
  }
}

.sales-metric-card__label,
.sales-metric-card__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-meta);
  line-height: var(--ui-line-height-meta);
}

.sales-metric-card__value {
  margin-top: 6px;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-number);
  font-weight: var(--ui-font-weight-number);
  line-height: var(--ui-line-height-number);
  overflow-wrap: anywhere;
}

.sales-metric-card__meta {
  margin-top: 4px;
}
</style>
