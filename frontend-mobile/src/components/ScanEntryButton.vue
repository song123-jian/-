<template>
  <van-button size="small" type="primary" :disabled="disabled" @click="handleClick">
    {{ buttonText }}
  </van-button>
</template>

<script setup lang="ts">
import { showToast } from 'vant'
import {
  normalizeMobileScanPayload,
  type MobileScanPayload,
  type MobileScanTargetType,
} from '../utils/scan-entry'

const props = withDefaults(defineProps<{
  rawValue?: string | number
  expectedType?: MobileScanTargetType
  buttonText?: string
  disabled?: boolean
}>(), {
  rawValue: '',
  expectedType: 'unknown',
  buttonText: '扫码',
  disabled: false,
})

const emit = defineEmits<{
  scanned: [payload: MobileScanPayload]
}>()

function handleClick() {
  const payload = normalizeMobileScanPayload(props.rawValue, props.expectedType)
  if (!payload.valid) {
    showToast(payload.error)
    return
  }
  emit('scanned', payload)
}
</script>
