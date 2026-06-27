import request from './index'

// PLC/设备遥测上报
export const pushTelemetry = (data: any) => request.post('/integrations/plc/telemetry', data)

// 扫码识别
export const scanIntegration = (data: any) => request.post('/integrations/scan', data)

// 标签预览
export const previewLabel = (data: any) => request.post('/integrations/label/preview', data)

// 称重换算
export const convertScale = (data: any) => request.post('/integrations/scale', data)

// 推送测试
export const pushTest = (data: any) => request.post('/integrations/push/test', data)
