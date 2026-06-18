<template>
  <div class="search-bar">
    <el-form :inline="true" :model="searchForm" class="search-form">
      <el-form-item label="关键词">
        <el-input
          v-model="searchForm.keyword"
          placeholder="请输入关键词"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>
      <slot />
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
import { reactive } from 'vue'

// 搜索栏组件
const emit = defineEmits<{
  search: [form: any]
  reset: []
}>()

const searchForm = reactive({
  keyword: '',
})

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
  padding: 20px 20px 0;
  border-radius: 4px;
  margin-bottom: 16px;

  .search-form {
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
