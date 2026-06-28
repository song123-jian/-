<template>
  <div class="page-container">
    <PageHeader title="系统配置">
      <el-button @click="handleReset">
        <el-icon><Refresh /></el-icon>
        重置
      </el-button>
      <el-button type="primary" @click="handleSave">
        <el-icon><Check /></el-icon>
        保存
      </el-button>
    </PageHeader>

    <el-card shadow="hover">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="140px" class="config-form">
        <el-divider content-position="left">基础配置</el-divider>
        <el-form-item label="工厂名称" prop="factory_name">
          <el-input v-model="form.factory_name" placeholder="请输入工厂名称" />
        </el-form-item>
        <el-form-item label="系统标题" prop="system_title">
          <el-input v-model="form.system_title" placeholder="请输入系统标题" />
        </el-form-item>
        <el-form-item label="默认原料仓" prop="default_raw_warehouse">
          <el-input v-model="form.default_raw_warehouse" placeholder="请输入默认原料仓编号" />
        </el-form-item>
        <el-form-item label="默认成品仓" prop="default_finish_warehouse">
          <el-input v-model="form.default_finish_warehouse" placeholder="请输入默认成品仓编号" />
        </el-form-item>
        <el-form-item label="白班开始时间" prop="shift_day_start">
          <el-input v-model="form.shift_day_start" placeholder="08:00" />
        </el-form-item>
        <el-form-item label="夜班开始时间" prop="shift_night_start">
          <el-input v-model="form.shift_night_start" placeholder="20:00" />
        </el-form-item>
        <el-form-item label="日工时加班阈值" prop="overtime_threshold_min">
          <el-input-number v-model="form.overtime_threshold_min" :min="1" :max="1440" />
        </el-form-item>

        <el-divider content-position="left">预警与策略</el-divider>
        <el-form-item label="不良率预警(%)" prop="bad_rate_warning">
          <el-input-number v-model="form.bad_rate_warning" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="交期预警天数" prop="delivery_warning_days">
          <el-input-number v-model="form.delivery_warning_days" :min="1" :max="30" />
        </el-form-item>
        <el-form-item label="计件容差(%)" prop="piece_price_tolerance">
          <el-input-number v-model="form.piece_price_tolerance" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="库存预警启用" prop="stock_warning_enabled">
          <el-switch v-model="form.stock_warning_enabled" />
        </el-form-item>
        <el-form-item label="先进先出" prop="fifo_enabled">
          <el-switch v-model="form.fifo_enabled" />
        </el-form-item>
        <el-form-item label="盘点冻结库存" prop="inventory_freeze_on_count">
          <el-switch v-model="form.inventory_freeze_on_count" />
        </el-form-item>
        <el-form-item label="库位容量校验" prop="location_capacity_check">
          <el-switch v-model="form.location_capacity_check" />
        </el-form-item>
        <el-form-item label="自动日结工资" prop="auto_daily_settle">
          <el-switch v-model="form.auto_daily_settle" />
        </el-form-item>

        <el-divider content-position="left">备份与推送</el-divider>
        <el-form-item label="自动备份" prop="auto_backup">
          <el-switch v-model="form.auto_backup" />
        </el-form-item>
        <el-form-item v-if="form.auto_backup" label="备份时间" prop="backup_time">
          <el-input v-model="form.backup_time" placeholder="02:00" />
        </el-form-item>
        <el-form-item v-if="form.auto_backup" label="备份保留天数" prop="backup_keep_days">
          <el-input-number v-model="form.backup_keep_days" :min="1" :max="365" />
        </el-form-item>
        <el-form-item label="外部推送启用" prop="external_push_enabled">
          <el-switch v-model="form.external_push_enabled" />
        </el-form-item>
        <el-form-item label="企业微信Webhook" prop="wecom_webhook_url">
          <el-input v-model="form.wecom_webhook_url" placeholder="请输入企业微信 Webhook" />
        </el-form-item>
        <el-form-item label="钉钉Webhook" prop="dingtalk_webhook_url">
          <el-input v-model="form.dingtalk_webhook_url" placeholder="请输入钉钉 Webhook" />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { getSystemConfig, updateSystemConfig } from '@/api/system'

const formRef = ref<FormInstance>()
const form = reactive({
  factory_name: '',
  system_title: '',
  default_raw_warehouse: '',
  default_finish_warehouse: '',
  shift_day_start: '08:00',
  shift_night_start: '20:00',
  overtime_threshold_min: 480,
  bad_rate_warning: 5,
  delivery_warning_days: 3,
  piece_price_tolerance: 5,
  stock_warning_enabled: true,
  fifo_enabled: true,
  inventory_freeze_on_count: true,
  location_capacity_check: false,
  auto_daily_settle: true,
  auto_backup: true,
  backup_time: '02:00',
  backup_keep_days: 30,
  external_push_enabled: false,
  wecom_webhook_url: '',
  dingtalk_webhook_url: '',
})

const formRules: FormRules = {
  factory_name: [{ required: true, message: '请输入工厂名称', trigger: 'blur' }],
  system_title: [{ required: true, message: '请输入系统标题', trigger: 'blur' }],
}

function toBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  return ['true', '1', 1, true, 'yes', 'on'].includes(value as never)
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeConfig(data: Record<string, any>) {
  return {
    factory_name: data.factory_name ?? form.factory_name,
    system_title: data.system_title ?? form.system_title,
    default_raw_warehouse: data.default_raw_warehouse ?? form.default_raw_warehouse,
    default_finish_warehouse: data.default_finish_warehouse ?? form.default_finish_warehouse,
    shift_day_start: data.shift_day_start ?? form.shift_day_start,
    shift_night_start: data.shift_night_start ?? form.shift_night_start,
    overtime_threshold_min: toNumber(data.overtime_threshold_min, form.overtime_threshold_min),
    bad_rate_warning: toNumber(data.bad_rate_warning, form.bad_rate_warning),
    delivery_warning_days: toNumber(data.delivery_warning_days, form.delivery_warning_days),
    piece_price_tolerance: toNumber(data.piece_price_tolerance, form.piece_price_tolerance),
    stock_warning_enabled: toBoolean(data.stock_warning_enabled, form.stock_warning_enabled),
    fifo_enabled: toBoolean(data.fifo_enabled, form.fifo_enabled),
    inventory_freeze_on_count: toBoolean(data.inventory_freeze_on_count, form.inventory_freeze_on_count),
    location_capacity_check: toBoolean(data.location_capacity_check, form.location_capacity_check),
    auto_daily_settle: toBoolean(data.auto_daily_settle, form.auto_daily_settle),
    auto_backup: toBoolean(data.auto_backup, form.auto_backup),
    backup_time: data.backup_time ?? form.backup_time,
    backup_keep_days: toNumber(data.backup_keep_days, form.backup_keep_days),
    external_push_enabled: toBoolean(data.external_push_enabled, form.external_push_enabled),
    wecom_webhook_url: data.wecom_webhook_url ?? '',
    dingtalk_webhook_url: data.dingtalk_webhook_url ?? '',
  }
}

async function loadConfig() {
  try {
    const res: any = await getSystemConfig()
    if (res.data) {
      Object.assign(form, normalizeConfig(res.data))
    }
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await updateSystemConfig({
      factory_name: form.factory_name,
      system_title: form.system_title,
      default_raw_warehouse: form.default_raw_warehouse,
      default_finish_warehouse: form.default_finish_warehouse,
      shift_day_start: form.shift_day_start,
      shift_night_start: form.shift_night_start,
      overtime_threshold_min: String(form.overtime_threshold_min),
      bad_rate_warning: String(form.bad_rate_warning),
      delivery_warning_days: String(form.delivery_warning_days),
      piece_price_tolerance: String(form.piece_price_tolerance),
      stock_warning_enabled: String(form.stock_warning_enabled),
      fifo_enabled: String(form.fifo_enabled),
      inventory_freeze_on_count: String(form.inventory_freeze_on_count),
      location_capacity_check: String(form.location_capacity_check),
      auto_daily_settle: String(form.auto_daily_settle),
      auto_backup: String(form.auto_backup),
      backup_time: form.backup_time,
      backup_keep_days: String(form.backup_keep_days),
      external_push_enabled: String(form.external_push_enabled),
      wecom_webhook_url: form.wecom_webhook_url,
      dingtalk_webhook_url: form.dingtalk_webhook_url,
    })
    ElMessage.success('保存成功')
  } catch {
    // 已由全局拦截器处理
  }
}

function handleReset() {
  loadConfig()
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped lang="scss">
.config-form {
  max-width: 900px;
}
</style>
