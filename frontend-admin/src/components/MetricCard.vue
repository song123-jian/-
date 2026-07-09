<template>
  <article class="ui-metric-card" :class="`is-${tone}`">
    <div class="ui-metric-card__main">
      <div class="ui-metric-card__content">
        <div class="ui-metric-card__label">{{ label }}</div>
        <DisplayNumber
          class="ui-metric-card__value"
          :value="value"
          :type="valueType"
          :precision="displayPrecision"
          :prefix="prefix"
          :unit="unit"
        />
      </div>
      <el-icon v-if="icon" class="ui-metric-card__icon">
        <component :is="icon" />
      </el-icon>
    </div>
    <div v-if="meta" class="ui-metric-card__meta">{{ meta }}</div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import DisplayNumber from './DisplayNumber.vue'

const props = withDefaults(defineProps<{
  label: string
  value?: number | string | null
  valueType?: 'money' | 'number' | 'percent'
  precision?: number
  prefix?: string
  unit?: string
  meta?: string
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'default'
  icon?: string | Component
}>(), {
  value: 0,
  valueType: 'number',
  prefix: undefined,
  unit: '',
  meta: '',
  tone: 'neutral',
  icon: undefined,
})

const displayPrecision = computed(() => props.precision ?? (props.valueType === 'percent' ? 1 : 2))
</script>

<style scoped lang="scss">
.ui-metric-card {
  min-width: 0;
}

.ui-metric-card__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.ui-metric-card__content {
  min-width: 0;
}

.ui-metric-card__icon {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
}

.ui-metric-card.is-primary .ui-metric-card__icon {
  color: var(--ui-color-primary);
}

.ui-metric-card.is-success .ui-metric-card__icon {
  color: var(--ui-color-success);
}

.ui-metric-card.is-warning .ui-metric-card__icon {
  color: var(--ui-color-warning);
}

.ui-metric-card.is-danger .ui-metric-card__icon {
  color: var(--ui-color-danger);
}
</style>
