<template>
  <el-card shadow="hover" class="side-card">
    <template #header>{{ title }}</template>
    <div v-if="row" class="detail-list">
      <div v-for="item in items" :key="item.prop" class="detail-item">
        <span>{{ item.label }}</span>
        <strong>{{ resolveValue(item) }}</strong>
      </div>
    </div>
    <el-empty v-else :description="emptyText" />
  </el-card>
</template>

<script setup lang="ts">
import type { DetailItem } from '@/views/base/base-data-schema'

const props = defineProps<{
  title: string
  emptyText: string
  row: any
  items: DetailItem[]
}>()

function resolveValue(item: DetailItem) {
  const value = props.row?.[item.prop]
  if (item.formatter) return item.formatter(value, props.row)
  return value === null || value === undefined || value === '' ? '-' : value
}
</script>

