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
  background: #eef2f6;
  color: #1f2933;
  font-size: 14px;
  line-height: 1.5;
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
  gap: 14px;
  min-width: 0;
}

.page-container > .el-card,
.page-container > .search-bar,
.page-container > .el-descriptions,
.page-container > .el-alert,
.page-container > .el-empty {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #dfe5ec;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.page-container > .el-card .el-card__header {
  padding: 12px 16px;
  border-bottom: 1px solid #e8edf3;
}

.page-container > .el-card .el-card__body {
  padding: 14px 16px;
}

.page-container .el-table {
  --el-table-border-color: #e7ecf2;
  --el-table-header-bg-color: #f5f7fa;
  --el-table-row-hover-bg-color: #f7fbff;
  --el-table-text-color: #1f2933;
  --el-table-header-text-color: #526071;
  border-radius: 6px;
}

.page-container .el-table .cell {
  padding: 0 12px;
  line-height: 22px;
}

.page-container .el-table th.el-table__cell {
  font-weight: 600;
  background: #f5f7fa;
}

.page-container .el-table td.el-table__cell {
  padding: 8px 0;
}

.page-container .el-tag {
  min-width: 56px;
  justify-content: center;
  border-radius: 999px;
  font-weight: 500;
}

.page-container .el-form-item__label {
  color: #4b5563;
  font-weight: 500;
}

.page-container .el-pagination {
  justify-content: flex-end;
  padding-top: 10px;
}

.page-container .el-card + .el-card {
  margin-top: 0;
}

.el-overlay-dialog .el-dialog {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
}

.el-dialog__header {
  margin-right: 0;
  padding: 14px 18px 12px;
  border-bottom: 1px solid #e8edf3;
}

.el-dialog__body {
  padding: 18px;
}

.el-dialog__footer {
  padding: 12px 18px 18px;
  border-top: 1px solid #e8edf3;
}

.el-button {
  border-radius: 6px;
  font-weight: 500;
}

.el-input__wrapper,
.el-select__wrapper,
.el-textarea__inner {
  border-radius: 6px;
}

@media (max-width: 768px) {
  .page-container {
    gap: 10px;
  }

  .page-container > .el-card,
  .page-container > .search-bar,
  .page-container > .el-descriptions,
  .page-container > .el-alert,
  .page-container > .el-empty {
    border-radius: 8px;
  }

  .page-container > .el-card .el-card__body {
    padding: 12px;
    overflow-x: auto;
  }

  .page-container .el-pagination {
    justify-content: center;
    flex-wrap: wrap;
  }

  .el-overlay-dialog .el-dialog {
    max-width: calc(100vw - 24px);
    margin-top: 6vh;
  }

  .el-dialog__body {
    padding: 14px;
  }

  .el-dialog .el-row {
    display: block;
  }

  .el-dialog .el-col-8,
  .el-dialog .el-col-12 {
    max-width: 100%;
    flex: 0 0 100%;
  }
}
</style>
