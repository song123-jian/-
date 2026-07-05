<template>
  <router-view />
</template>

<script setup lang="ts">
// 根组件：仅作为路由容器
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background-color: #eef2f6;
  color: #1f2933;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  --van-primary-color: #0f766e;
  --van-success-color: #16a34a;
  --van-warning-color: #d97706;
  --van-danger-color: #dc2626;
  --van-background: #eef2f6;
  --van-background-2: #ffffff;
  --van-text-color: #1f2933;
  --van-text-color-2: #526071;
  --van-border-color: #dfe5ec;
  --van-radius-md: 8px;
  --van-button-border-radius: 8px;
  --van-cell-group-inset-radius: 8px;
  --van-nav-bar-background: #ffffff;
  --van-nav-bar-title-text-color: #1f2933;
  --van-tabbar-item-active-color: #0f766e;
}

#app {
  width: 100%;
  min-height: 100vh;
}

.van-cell-group--inset {
  overflow: hidden;
  border: 1px solid #dfe5ec;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.van-nav-bar {
  border-bottom: 1px solid #dfe5ec;
}

.van-button--primary {
  font-weight: 600;
}

.van-tabbar {
  border-top: 1px solid #dfe5ec;
}
</style>
