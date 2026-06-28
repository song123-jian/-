<template>
  <div class="search-bar">
    <el-form :inline="true" :model="searchForm" class="search-form">
      <el-form-item label="关键字">
        <el-input
          v-model="searchForm.keyword"
          placeholder="请输入关键字"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>
      <slot :form="searchForm" />
      <el-form-item>
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

const props = defineProps<{
  keyword?: string
}>()

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
  padding: 16px 16px 4px;
  border: 1px solid #e6e8eb;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.03);

  .search-form {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: flex-start;
  }
}

:deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>
