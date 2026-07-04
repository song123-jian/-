import request from './index'
import type {
  IntegrationLabelInput,
  IntegrationPushInput,
  IntegrationScaleInput,
  IntegrationScanInput,
  IntegrationTelemetryInput,
} from '@/utils/integration-center'

// PLC/设备遥测上报
export const pushTelemetry = (data: IntegrationTelemetryInput) => request.post('/integrations/plc/telemetry', data)

// 扫码识别
export const scanIntegration = (data: IntegrationScanInput) => request.post('/integrations/scan', data)

// 标签预览
export const previewLabel = (data: IntegrationLabelInput) => request.post('/integrations/label/preview', data)

// 称重换算
export const convertScale = (data: IntegrationScaleInput) => request.post('/integrations/scale', data)

// 推送测试
export const pushTest = (data: IntegrationPushInput) => request.post('/integrations/push/test', data)
