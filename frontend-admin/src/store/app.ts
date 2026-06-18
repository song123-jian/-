import { defineStore } from 'pinia'
import { ref } from 'vue'

// 应用状态管理
export const useAppStore = defineStore('app', () => {
  // 侧边栏是否折叠
  const sidebarCollapsed = ref<boolean>(false)

  // 切换侧边栏折叠状态
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
  }
})
