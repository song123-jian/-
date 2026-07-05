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
  gap: 12px 16px;
  min-height: 42px;
  padding: 2px 0 8px;
  border-bottom: 1px solid #dfe5ec;

  .page-title {
    position: relative;
    flex: 1 1 180px;
    min-width: 0;
    padding-left: 10px;
    font-size: 18px;
    font-weight: 700;
    color: #1f2933;
    margin: 0;
    line-height: 1.35;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 4px;
      bottom: 4px;
      width: 3px;
      border-radius: 999px;
      background: #12a594;
    }
  }

  .page-extra {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 1 1 320px;
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
