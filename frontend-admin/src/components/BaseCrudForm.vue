<template>
  <el-dialog v-model="visible" :title="title" :width="config.dialogWidth" class="base-crud-dialog">
    <el-form ref="formRef" :model="model" :rules="resolvedFormRules" :label-width="config.formLabelWidth" class="base-crud-form">
      <template v-for="(row, rowIndex) in config.formRows" :key="rowIndex">
        <el-row :gutter="16">
          <el-col v-for="field in row" :key="field.prop" :span="field.span || 24">
            <el-form-item :label="field.label" :prop="field.prop">
              <el-input
                v-if="field.type === 'input'"
                v-model="model[field.prop]"
                :placeholder="field.placeholder"
                :disabled="field.disabledOnEdit && isEditing"
              />
              <el-input
                v-else-if="field.type === 'textarea'"
                v-model="model[field.prop]"
                type="textarea"
                :rows="field.rows || 3"
                :placeholder="field.placeholder"
              />
              <el-input-number
                v-else-if="field.type === 'number'"
                v-model="model[field.prop]"
                :min="field.min"
                :precision="field.precision"
                style="width: 100%"
              />
              <el-date-picker
                v-else-if="field.type === 'date'"
                v-model="model[field.prop]"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="请选择日期"
                style="width: 100%"
              />
              <el-select
                v-else-if="field.type === 'select'"
                v-model="model[field.prop]"
                :placeholder="field.placeholder || '请选择'"
                :filterable="field.filterable"
                style="width: 100%"
              >
                <el-option
                  v-for="option in resolveOptions(field)"
                  :key="String(option.value)"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </template>
    </el-form>
    <template #footer>
      <div class="dialog-actions">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import type { BasePageConfig, FormField } from '@/views/base/base-data-schema'

const props = defineProps<{
  modelValue: boolean
  title: string
  config: BasePageConfig<any, any>
  model: Record<string, any>
  isEditing: boolean
  productOptions?: Array<{ label: string; value: string | number }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
}>()

const formRef = ref<FormInstance>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const resolvedFormRules = computed(() =>
  typeof props.config.formRules === 'function'
    ? props.config.formRules({ isEditing: props.isEditing, model: props.model })
    : props.config.formRules
)

async function handleConfirm() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (valid) {
    emit('submit')
  }
}

function resolveOptions(field: FormField) {
  if (field.optionsSource === 'products') {
    return props.productOptions || []
  }
  return field.options || []
}

defineExpose({ formRef })
</script>

<style scoped lang="scss">
.base-crud-form {
  :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  :deep(.el-form-item__label) {
    color: #4b5563;
    font-weight: 500;
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
