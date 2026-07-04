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
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="160px" class="config-form">
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
          <el-input-number v-model="form.delivery_warning_days" :min="1" :max="365" />
        </el-form-item>
        <el-form-item label="批次临期预警天数" prop="stock_expiry_warning_days">
          <el-input-number v-model="form.stock_expiry_warning_days" :min="1" :max="365" />
        </el-form-item>
        <el-form-item label="计件容差(%)" prop="piece_price_tolerance">
          <el-input-number v-model="form.piece_price_tolerance" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="模具保养预警(%)" prop="mold_maintenance_warning_ratio">
          <el-input-number v-model="form.mold_maintenance_warning_ratio" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="模具寿命预警(%)" prop="mold_lifetime_warning_ratio">
          <el-input-number v-model="form.mold_lifetime_warning_ratio" :min="1" :max="100" />
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
import {
  DEFAULT_SYSTEM_CONFIG,
  buildSystemConfigPayload,
  normalizeSystemConfig,
  validateSystemConfig,
  type SystemConfigForm,
} from '@/utils/system-config'

const formRef = ref<FormInstance>()
const form = reactive<SystemConfigForm>({ ...DEFAULT_SYSTEM_CONFIG })

const formRules: FormRules = {
  factory_name: [{ required: true, message: '请输入工厂名称', trigger: 'blur' }],
  system_title: [{ required: true, message: '请输入系统标题', trigger: 'blur' }],
}

async function loadConfig() {
  try {
    const res: any = await getSystemConfig()
    if (res.data) {
      Object.assign(form, normalizeSystemConfig(res.data))
    }
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const validationMessage = validateSystemConfig(form)
  if (validationMessage) {
    ElMessage.warning(validationMessage)
    return
  }
  try {
    await updateSystemConfig(buildSystemConfigPayload(form))
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
