<template>
  <div class="page-header">
    <h2 class="page-title">{{ title }}</h2>
    <div class="page-extra">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面标题组件
defineProps<{
  title: string
}>()
</script>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  min-height: 44px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8ebf0;

  .page-title {
    flex: 1 1 180px;
    min-width: 0;
    font-size: 18px;
    font-weight: 600;
    color: #303133;
    margin: 0;
    line-height: 1.2;
  }

  .page-extra {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 1 1 320px;
    flex-wrap: wrap;
    gap: 10px;
  }
}
</style>
