<template>
  <div class="base-crud-table">
    <el-card shadow="never">
      <el-table
        :data="rows"
        stripe
        v-loading="loading"
        :empty-text="config.emptyText"
        class="crud-table"
        @selection-change="$emit('selection-change', $event)"
      >
        <el-table-column v-if="showSelection" type="selection" width="46" />
        <el-table-column
          v-for="column in config.tableColumns"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :width="column.width"
          :min-width="column.minWidth"
          :fixed="column.fixed"
          :align="column.align"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <template v-if="column.kind === 'tag'">
              <StatusTag v-bind="resolveTag(column, row[column.prop])" />
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
        <el-table-column :label="actionLabel" fixed="right" :width="resolvedActionWidth" align="center" class-name="action-column">
          <template #default="{ row }">
            <RowActions
              :actions="resolveRowActions(row)"
              :max-visible="2"
              @command="$emit('row-action', $event, row)"
            />
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
import { computed } from 'vue'
import type { BasePageConfig, TableColumn } from '@/views/base/base-data-schema'
import { resolveTagMeta } from '@/views/base/base-data-schema'
import RowActions, { type RowActionItem } from './RowActions.vue'
import StatusTag from './StatusTag.vue'

const props = defineProps<{
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

const resolvedActionWidth = computed(() => Math.min(Number(props.config.actionWidth || 150), 170))

function resolveRowActions(row: any): RowActionItem[] {
  return props.config.rowActions.map((action) => ({
    key: action.key,
    label: typeof action.label === 'function' ? action.label(row) : action.label,
    type: action.type || 'primary',
  }))
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
.base-crud-table {
  min-width: 0;
}

.crud-table {
  width: 100%;
}

.pagination {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.table-image {
  width: 44px;
  height: 44px;
  border-radius: var(--ui-radius-control);
  border: 1px solid var(--ui-color-border-soft);
  background: var(--ui-color-surface-muted);
  vertical-align: middle;
}
</style>
