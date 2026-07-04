<template>
  <div class="base-crud-table">
    <el-card shadow="hover">
      <el-table :data="rows" stripe v-loading="loading" :empty-text="config.emptyText" @selection-change="$emit('selection-change', $event)">
        <el-table-column v-if="showSelection" type="selection" width="46" />
        <el-table-column
          v-for="column in config.tableColumns"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :width="column.width"
          :min-width="column.minWidth"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <template v-if="column.kind === 'tag'">
              <el-tag :type="resolveTag(column, row[column.prop]).type" effect="plain">
                {{ resolveTag(column, row[column.prop]).label }}
              </el-tag>
            </template>
            <template v-else-if="column.kind === 'progress'">
              <el-progress :percentage="column.progress ? column.progress(row) : 0" :stroke-width="10" />
            </template>
            <template v-else-if="column.kind === 'image'">
              <el-image
                v-if="resolveCell(column, row) !== '-'"
                class="table-image"
                :src="resolveCell(column, row)"
                :alt="column.imageAlt ? column.imageAlt(row) : column.label"
                fit="cover"
                lazy
              />
              <span v-else>-</span>
            </template>
            <template v-else>
              {{ resolveCell(column, row) }}
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="actionLabel" fixed="right" :width="config.actionWidth">
          <template #default="{ row }">
            <el-button
              v-for="action in config.rowActions"
              :key="action.key"
              link
              :type="action.type || 'primary'"
              @click="$emit('row-action', action.key, row)"
            >
              {{ typeof action.label === 'function' ? action.label(row) : action.label }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="$emit('page-change')"
        @current-change="$emit('page-change')"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import type { BasePageConfig, TableColumn } from '@/views/base/base-data-schema'
import { resolveTagMeta } from '@/views/base/base-data-schema'

defineProps<{
  config: BasePageConfig<any, any>
  rows: any[]
  loading: boolean
  showSelection?: boolean
  pagination: { page: number; pageSize: number; total: number }
  actionLabel: string
}>()

defineEmits<{
  'selection-change': [rows: any[]]
  'page-change': []
  'row-action': [key: string, row: any]
}>()

function resolveTag(column: TableColumn, value: any) {
  return column.tagMap ? resolveTagMeta(column.tagMap, value) : resolveTagMeta({}, value)
}

function resolveCell(column: TableColumn, row: any) {
  if (column.formatter) {
    return column.formatter(row[column.prop], row)
  }
  const value = row[column.prop]
  return value === null || value === undefined || value === '' ? '-' : value
}
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.table-image {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: 1px solid #e6e8eb;
  background: #f8fafc;
  vertical-align: middle;
}
</style>
