<template>
  <router-view />
</template>

<script setup lang="ts">
// 根组件
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  font-family: 'Microsoft YaHei', 'PingFang SC', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  background: #f3f5f7;
  color: #1f2329;
}

body {
  overflow: hidden;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
textarea,
select {
  font: inherit;
}

.page-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.page-container > .el-card,
.page-container > .search-bar,
.page-container > .el-descriptions,
.page-container > .el-alert,
.page-container > .el-empty {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e6e8eb;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
}

.page-container > .el-card .el-card__header {
  padding: 14px 16px;
  border-bottom: 1px solid #eef1f4;
}

.page-container > .el-card .el-card__body {
  padding: 16px;
}

.page-container .el-table {
  --el-table-border-color: #edf0f3;
  --el-table-header-bg-color: #f7f9fb;
  --el-table-text-color: #1f2329;
  --el-table-header-text-color: #6b7280;
}

.page-container .el-table .cell {
  padding: 0 12px;
}

.page-container .el-table th.el-table__cell {
  font-weight: 600;
}

.page-container .el-form-item__label {
  color: #4b5563;
  font-weight: 500;
}

.page-container .el-pagination {
  justify-content: flex-end;
  padding-top: 12px;
}

.page-container .el-card + .el-card {
  margin-top: 0;
}

.el-overlay-dialog .el-dialog {
  border-radius: 12px;
  overflow: hidden;
}

.el-dialog__header {
  margin-right: 0;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #eef1f4;
}

.el-dialog__body {
  padding: 18px;
}

.el-dialog__footer {
  padding: 12px 18px 18px;
  border-top: 1px solid #eef1f4;
}

.el-button {
  border-radius: 8px;
}

.el-input__wrapper,
.el-select__wrapper,
.el-textarea__inner {
  border-radius: 8px;
}
</style>
