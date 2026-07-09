<template>
  <div class="search-bar">
    <div v-if="title || description" class="search-bar-head">
      <div class="search-bar-copy">
        <strong v-if="title">{{ title }}</strong>
        <span v-if="description">{{ description }}</span>
      </div>
      <slot name="summary" />
    </div>
    <el-form :inline="true" :model="searchForm" class="search-form">
      <el-form-item v-if="showKeyword" label="关键字" class="keyword-item">
        <el-input
          v-model="searchForm.keyword"
          :placeholder="keywordPlaceholder"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>
      <slot :form="searchForm" />
      <el-form-item class="search-actions">
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

const emit = defineEmits<{
  search: [form: any]
  reset: []
}>()

const props = withDefaults(defineProps<{
  keyword?: string
  title?: string
  description?: string
  keywordPlaceholder?: string
  showKeyword?: boolean
}>(), {
  keyword: '',
  title: '',
  description: '',
  keywordPlaceholder: '请输入关键字',
  showKeyword: true,
})

const searchForm = reactive({
  keyword: '',
})

watch(
  () => props.keyword,
  (value) => {
    searchForm.keyword = value || ''
  },
  { immediate: true },
)

function handleSearch() {
  emit('search', { ...searchForm })
}

function handleReset() {
  searchForm.keyword = ''
  emit('reset')
}
</script>

<style scoped lang="scss">
.search-bar {
  background: #fff;
  padding: 14px 14px 2px;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius-card);
  box-shadow: var(--ui-shadow-card);

  .search-bar-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ui-color-border-soft);
  }

  .search-bar-copy {
    min-width: 0;
    display: grid;
    gap: 3px;

    strong {
      color: var(--ui-color-text);
      font-size: var(--ui-font-size-section-title);
      line-height: var(--ui-line-height-body);
    }

    span {
      color: var(--ui-color-text-muted);
      font-size: var(--ui-font-size-meta);
      line-height: var(--ui-line-height-meta);
    }
  }

  .search-form {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    align-items: flex-start;
  }

  .keyword-item :deep(.el-input) {
    width: 220px;
  }

  .search-actions {
    margin-left: auto;
  }
}

:deep(.el-form-item) {
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .search-bar {
    padding: 12px 12px 0;

    .search-bar-head {
      flex-direction: column;
    }

    .search-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .keyword-item :deep(.el-input),
    :deep(.el-form-item),
    :deep(.el-form-item__content),
    :deep(.el-select),
    :deep(.el-date-editor) {
      width: 100% !important;
    }

    .search-actions {
      margin-left: 0;

      :deep(.el-form-item__content) {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      :deep(.el-button) {
        margin-left: 0;
      }
    }
  }
}
</style>
