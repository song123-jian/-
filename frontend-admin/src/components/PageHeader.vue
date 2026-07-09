<template>
  <div class="page-header">
    <div class="page-heading">
      <h2 class="page-title">{{ title }}</h2>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div class="page-extra">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  min-height: 44px;
  padding: 2px 0 10px;
  border-bottom: 1px solid var(--ui-color-border);
}

.page-heading {
  min-width: 0;
  flex: 1 1 240px;
}

.page-title {
  position: relative;
  margin: 0;
  padding-left: 10px;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-page-title);
  font-weight: var(--ui-font-weight-title);
  line-height: var(--ui-line-height-title);
  letter-spacing: 0;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: var(--ui-radius-tag);
    background: var(--ui-color-primary);
  }
}

.page-subtitle {
  margin: 5px 0 0 10px;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-meta);
  line-height: var(--ui-line-height-meta);
}

.page-extra {
  min-width: 0;
  flex: 1 1 320px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;

  :deep(.el-icon) {
    width: var(--ui-icon-button);
    height: var(--ui-icon-button);
    font-size: var(--ui-icon-button);
  }
}

@media (max-width: 640px) {
  .page-extra {
    flex-basis: 100%;
    justify-content: flex-start;
  }
}
</style>
