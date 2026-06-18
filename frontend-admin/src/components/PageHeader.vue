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
  margin-bottom: 20px;

  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #303133;
    margin: 0;
  }

  .page-extra {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}
</style>
