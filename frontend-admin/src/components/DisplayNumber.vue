<template>
  <span class="ui-number" :class="`ui-number--${type}`">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '@/utils'

const props = withDefaults(defineProps<{
  value?: number | string | null
  type?: 'money' | 'number' | 'percent'
  precision?: number
  prefix?: string
  unit?: string
}>(), {
  value: 0,
  type: 'number',
  unit: '',
})

const rawText = computed(() => String(props.value ?? '').trim())

const numericValue = computed(() => {
  const num = Number(props.value || 0)
  return Number.isFinite(num) ? num : 0
})

const resolvedPrecision = computed(() => props.precision ?? (props.type === 'percent' ? 1 : 2))

const text = computed(() => {
  if (rawText.value && !Number.isFinite(Number(rawText.value))) return rawText.value
  if (props.type === 'money') return `${props.prefix ?? '¥'}${formatMoney(numericValue.value)}${props.unit}`
  if (props.type === 'percent') return `${numericValue.value.toFixed(resolvedPrecision.value)}%`
  return `${props.prefix || ''}${numericValue.value.toLocaleString('zh-CN', { maximumFractionDigits: resolvedPrecision.value })}${props.unit}`
})
</script>

<style scoped lang="scss">
.ui-number {
  display: inline-block;
  max-width: 100%;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  letter-spacing: 0;
  white-space: nowrap;
}

.ui-number--money,
.ui-number--percent {
  text-align: right;
}
</style>
