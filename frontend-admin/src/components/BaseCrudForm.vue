<template>
  <el-dialog v-model="visible" :title="title" :width="config.dialogWidth" class="base-crud-dialog">
    <el-form ref="formRef" :model="model" :rules="resolvedFormRules" :label-width="config.formLabelWidth" class="base-crud-form">
      <section v-for="section in resolvedSections" :key="section.title" class="form-section">
        <div class="form-section__title">{{ section.title }}</div>
        <template v-for="(row, rowIndex) in section.rows" :key="`${section.title}-${rowIndex}`">
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
      </section>
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

const resolvedSections = computed(() =>
  props.config.formSections?.length
    ? props.config.formSections
    : inferFormSections(props.config.formRows)
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

function inferFormSections(rows: FormField[][]) {
  if (rows.length <= 2) {
    return [{ title: '基础信息', rows }]
  }

  const statusStart = Math.max(1, rows.length - 2)
  const sections = [
    { title: '基础信息', rows: rows.slice(0, Math.min(2, rows.length)) },
    { title: '业务参数', rows: rows.slice(Math.min(2, rows.length), statusStart) },
    { title: '状态/备注', rows: rows.slice(statusStart) },
  ]
  return sections.filter((section) => section.rows.length > 0)
}

defineExpose({ formRef })
</script>

<style scoped lang="scss">
.base-crud-form {
  .form-section + .form-section {
    margin-top: 8px;
  }

  .form-section__title {
    margin: 2px 0 12px;
    padding-left: 8px;
    border-left: 3px solid var(--ui-color-primary);
    color: var(--ui-color-text);
    font-size: var(--ui-font-size-body);
    font-weight: var(--ui-font-weight-label);
    line-height: var(--ui-line-height-meta);
  }

  :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  :deep(.el-form-item__label) {
    color: var(--ui-color-text-secondary);
    font-weight: 500;
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
