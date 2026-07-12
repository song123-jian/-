<template>
  <div class="page-container">
    <PageHeader title="系统配置">
      <template v-if="activeTab === 'general'">
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
        <el-button type="primary" @click="handleSave">
          <el-icon><Check /></el-icon>
          保存
        </el-button>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" class="config-tabs">
      <el-tab-pane label="系统参数" name="general">
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

        <el-card shadow="hover" class="danger-card">
          <div class="danger-head">
            <div>
              <h3>危险操作</h3>
              <p>用于上线前清理演示和测试业务数据。操作会保留管理员账号与系统配置，但会清除单据、库存、质量、工资、流程、日志和基础业务资料。</p>
            </div>
            <el-button type="danger" :loading="clearing" @click="handleClearAllData">
              一键清除所有数据
            </el-button>
          </div>
          <el-alert
            title="执行后不可从页面撤销，请先确认云库备份或恢复点已就绪。"
            type="warning"
            show-icon
            :closable="false"
          />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="角色菜单" name="role-menu">
        <RoleMenuConfigurator />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import RoleMenuConfigurator from '@/components/RoleMenuConfigurator.vue'
import { clearAllBusinessData, getSystemConfig, updateSystemConfig } from '@/api/system'
import {
  DEFAULT_SYSTEM_CONFIG,
  buildSystemConfigPayload,
  normalizeSystemConfig,
  validateSystemConfig,
  type SystemConfigForm,
} from '@/utils/system-config'

const formRef = ref<FormInstance>()
const form = reactive<SystemConfigForm>({ ...DEFAULT_SYSTEM_CONFIG })
const activeTab = ref('general')
const clearing = ref(false)
const CLEAR_CONFIRM_TEXT = '清除所有业务数据'

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

async function handleClearAllData() {
  try {
    const confirmText = await ElMessageBox.prompt(
      `请输入“${CLEAR_CONFIRM_TEXT}”确认清除。该操作会保留管理员账号和系统配置。`,
      '一键清除所有数据',
      {
        confirmButtonText: '确认清除',
        cancelButtonText: '取消',
        inputPlaceholder: CLEAR_CONFIRM_TEXT,
        inputValidator(value) {
          return String(value || '').trim() === CLEAR_CONFIRM_TEXT || `必须输入：${CLEAR_CONFIRM_TEXT}`
        },
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    clearing.value = true
    const res: any = await clearAllBusinessData({ confirmText: String(confirmText.value || '').trim() })
    const clearedCount = res?.data?.clearedTables?.length || 0
    const skippedCount = res?.data?.skippedTables?.length || 0
    ElMessage.success(`清除完成：${clearedCount} 张表已处理，${skippedCount} 张表跳过`)
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    if (error?.message) ElMessage.error(error.message)
  } finally {
    clearing.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped lang="scss">
.config-form {
  max-width: 900px;
}

.danger-card {
  margin-top: 16px;
  border-color: #f3c5c5;
}

.danger-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.danger-head h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #b42318;
}

.danger-head p {
  margin: 0;
  max-width: 760px;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

@media (max-width: 640px) {
  .danger-head {
    flex-direction: column;
  }
}
</style>
