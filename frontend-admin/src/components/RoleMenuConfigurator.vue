<template>
  <el-card v-loading="loading" shadow="hover" class="role-menu-card">
    <template #header>
      <div class="role-menu-header">
        <div class="role-menu-heading">
          <strong>角色菜单</strong>
          <el-tag size="small" effect="plain">{{ selectedCount }}/{{ availableCount }}</el-tag>
        </div>
        <div class="role-menu-actions">
          <el-radio-group v-model="activeRole" size="small">
            <el-radio-button v-for="role in ROLE_MENU_ROLES" :key="role.value" :value="role.value">
              {{ role.label }}
            </el-radio-button>
          </el-radio-group>
          <el-button size="small" @click="selectAllCurrentRole">
            <el-icon><CircleCheck /></el-icon>
            全选
          </el-button>
          <el-button size="small" @click="resetCurrentRole">
            <el-icon><Refresh /></el-icon>
            恢复默认
          </el-button>
          <el-button size="small" type="primary" :loading="saving" @click="handleSave">
            <el-icon><Check /></el-icon>
            保存菜单
          </el-button>
        </div>
      </div>
    </template>

    <div class="role-menu-grid">
      <section v-for="group in accessibleGroups" :key="group.path" class="role-menu-scope">
        <div class="role-menu-scope__header">
          <el-checkbox
            :model-value="isGroupChecked(group)"
            :indeterminate="isGroupIndeterminate(group)"
            @change="toggleGroup(group, $event)"
          >
            {{ group.title }}
          </el-checkbox>
          <span>{{ groupSelectedCount(group) }}/{{ group.children.length }}</span>
        </div>
        <el-checkbox-group
          v-model="roleMenus[activeRole]"
          class="role-menu-scope__items"
          @change="normalizeCurrentRole"
        >
          <el-checkbox
            v-for="item in group.children"
            :key="item.name"
            :value="item.name"
            :disabled="isRequiredItem(item.name)"
          >
            <span>{{ item.title }}</span>
            <el-tag v-if="isRequiredItem(item.name)" size="small" type="info" effect="plain">固定</el-tag>
          </el-checkbox>
        </el-checkbox-group>
      </section>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getRoleMenuConfig, updateRoleMenuConfig } from '@/api/system'
import { isSupabaseConfigured } from '@/api/supabaseClient'
import { routeGroups, type AppRouteGroup } from '@/router/route-config'
import {
  REQUIRED_ROLE_MENU_ITEMS,
  ROLE_MENU_ROLES,
  buildDefaultRoleMenuConfig,
  getRoleAccessibleRouteGroups,
  loadRoleMenuCache,
  normalizeRoleMenuConfig,
  saveRoleMenuCache,
  type RoleMenuConfig,
  type RoleMenuRole,
} from '@/utils/role-menu'

const activeRole = ref<RoleMenuRole>('admin')
const roleMenus = reactive<RoleMenuConfig>(loadRoleMenuCache(routeGroups))
const loading = ref(false)
const saving = ref(false)

const accessibleGroups = computed(() => getRoleAccessibleRouteGroups(routeGroups, activeRole.value))
const availableCount = computed(() => accessibleGroups.value.reduce((sum, group) => sum + group.children.length, 0))
const selectedCount = computed(() => {
  const allowed = new Set(accessibleGroups.value.flatMap((group) => group.children.map((item) => item.name)))
  return roleMenus[activeRole.value].filter((name) => allowed.has(name)).length
})

function applyRoleMenus(next: RoleMenuConfig) {
  for (const { value } of ROLE_MENU_ROLES) roleMenus[value] = [...next[value]]
}

function normalizedMenus() {
  return normalizeRoleMenuConfig(roleMenus, routeGroups)
}

function normalizeCurrentRole() {
  const normalized = normalizedMenus()
  roleMenus[activeRole.value] = [...normalized[activeRole.value]]
}

function isRequiredItem(name: string) {
  return REQUIRED_ROLE_MENU_ITEMS[activeRole.value].includes(name)
}

function selectedSet() {
  return new Set(roleMenus[activeRole.value])
}

function groupSelectedCount(group: AppRouteGroup) {
  const selected = selectedSet()
  return group.children.filter((item) => selected.has(item.name)).length
}

function isGroupChecked(group: AppRouteGroup) {
  return group.children.length > 0 && groupSelectedCount(group) === group.children.length
}

function isGroupIndeterminate(group: AppRouteGroup) {
  const count = groupSelectedCount(group)
  return count > 0 && count < group.children.length
}

function toggleGroup(group: AppRouteGroup, checked: unknown) {
  const selected = selectedSet()
  for (const item of group.children) {
    if (Boolean(checked) || isRequiredItem(item.name)) selected.add(item.name)
    else selected.delete(item.name)
  }
  roleMenus[activeRole.value] = [...selected]
  normalizeCurrentRole()
}

function selectAllCurrentRole() {
  roleMenus[activeRole.value] = accessibleGroups.value.flatMap((group) => group.children.map((item) => item.name))
  normalizeCurrentRole()
}

function resetCurrentRole() {
  roleMenus[activeRole.value] = [...buildDefaultRoleMenuConfig(routeGroups)[activeRole.value]]
}

async function loadRoleMenus() {
  applyRoleMenus(loadRoleMenuCache(routeGroups))
  if (!isSupabaseConfigured) return
  loading.value = true
  try {
    const res: any = await getRoleMenuConfig()
    if (res?.data?.configured && res.data.menus) {
      const normalized = saveRoleMenuCache(res.data.menus, routeGroups)
      applyRoleMenus(normalized)
    }
  } catch {
    // Keep the local cache when cloud configuration is unavailable.
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  const normalized = saveRoleMenuCache(normalizedMenus(), routeGroups)
  applyRoleMenus(normalized)
  try {
    if (isSupabaseConfigured) {
      await updateRoleMenuConfig(normalized)
      ElMessage.success('角色菜单已保存并同步')
    } else {
      ElMessage.success('角色菜单已保存到当前设备')
    }
  } catch {
    ElMessage.warning('角色菜单已在当前设备生效，云端同步失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadRoleMenus)
</script>

<style scoped lang="scss">
.role-menu-card {
  margin-top: 16px;
}

.role-menu-header,
.role-menu-actions,
.role-menu-heading,
.role-menu-scope__header {
  display: flex;
  align-items: center;
}

.role-menu-header {
  justify-content: space-between;
  gap: 16px;
}

.role-menu-heading,
.role-menu-actions {
  gap: 10px;
}

.role-menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.role-menu-scope {
  min-width: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.role-menu-scope__header {
  justify-content: space-between;
  min-height: 42px;
  padding: 0 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.role-menu-scope__items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 12px;
  padding: 10px 12px 12px;
}

.role-menu-scope__items :deep(.el-checkbox) {
  min-width: 0;
  margin-right: 0;
}

.role-menu-scope__items :deep(.el-checkbox__label) {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

@media (max-width: 900px) {
  .role-menu-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .role-menu-actions {
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .role-menu-grid,
  .role-menu-scope__items {
    grid-template-columns: 1fr;
  }
}
</style>
