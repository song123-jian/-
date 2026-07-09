<template>
  <el-tag class="ui-status-tag" :type="type" effect="plain">
    {{ label || '-' }}
  </el-tag>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  type?: 'success' | 'warning' | 'danger' | 'info' | 'primary' | ''
}>(), {
  label: '',
  type: '',
})
</script>

<style scoped lang="scss">
.ui-status-tag {
  vertical-align: middle;
}
</style>
