<template>
  <section class="ui-metric-strip" :data-testid="testid">
    <MetricCard
      v-for="item in items"
      :key="item.label"
      :label="item.label"
      :value="item.value"
      :value-type="item.valueType"
      :precision="item.precision"
      :prefix="item.prefix"
      :unit="item.unit"
      :meta="item.meta"
      :tone="item.tone"
      :icon="item.icon"
    />
  </section>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import MetricCard from './MetricCard.vue'

export type MetricStripItem = {
  label: string
  value?: number | string | null
  valueType?: 'money' | 'number' | 'percent'
  precision?: number
  prefix?: string
  unit?: string
  meta?: string
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'default'
  icon?: string | Component
}

withDefaults(defineProps<{
  items: MetricStripItem[]
  testid?: string
}>(), {
  testid: 'metric-strip',
})
</script>

<style scoped lang="scss">
.ui-metric-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
  gap: 12px;
}
</style>
