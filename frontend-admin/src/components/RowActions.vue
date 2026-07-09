<template>
  <div class="ui-row-actions" :class="`is-${align}`">
    <el-button
      v-for="action in visibleActions"
      :key="action.key"
      link
      :type="action.type || 'primary'"
      :disabled="action.disabled"
      :loading="action.loading"
      @click="emitCommand(action.key)"
    >
      {{ action.label }}
    </el-button>

    <el-dropdown
      v-if="overflowActions.length"
      class="ui-row-actions__dropdown"
      trigger="click"
      placement="bottom-end"
      @command="emitCommand"
    >
      <el-button class="ui-row-actions__more" link type="primary">
        {{ moreText }}
        <el-icon class="ui-row-actions__more-icon"><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="action in overflowActions"
            :key="action.key"
            :command="action.key"
            :disabled="action.disabled || action.loading"
            :class="{ 'is-danger': action.type === 'danger' }"
          >
            {{ action.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script lang="ts">
export type RowActionItem = {
  key: string
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  disabled?: boolean
  loading?: boolean
  visible?: boolean
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  actions: RowActionItem[]
  maxVisible?: number
  moreText?: string
  align?: 'start' | 'center' | 'end'
}>(), {
  maxVisible: 2,
  moreText: '更多',
  align: 'center',
})

const emit = defineEmits<{
  command: [key: string]
}>()

const availableActions = computed(() => props.actions.filter((action) => action.visible !== false))
const directActionCount = computed(() => Math.max(0, props.maxVisible))
const visibleActions = computed(() => availableActions.value.slice(0, directActionCount.value))
const overflowActions = computed(() => availableActions.value.slice(directActionCount.value))

function emitCommand(command: string | number | object) {
  const key = String(command)
  const action = availableActions.value.find((item) => item.key === key)
  if (!action || action.disabled || action.loading) return
  emit('command', key)
}
</script>

<style scoped lang="scss">
.ui-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-height: 24px;
  min-width: 0;
  white-space: nowrap;
}

.ui-row-actions.is-start {
  justify-content: flex-start;
}

.ui-row-actions.is-center {
  justify-content: center;
}

.ui-row-actions.is-end {
  justify-content: flex-end;
}

.ui-row-actions :deep(.el-button) {
  height: 24px;
  margin-left: 0;
  padding: 0;
}

.ui-row-actions__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ui-row-actions__more-icon {
  width: 12px;
  height: 12px;
  margin-left: 1px;
}

:global(.el-dropdown-menu__item.is-danger) {
  color: var(--el-color-danger);
}
</style>
