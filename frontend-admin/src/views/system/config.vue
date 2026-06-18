<template>
  <div class="page-container">
    <PageHeader title="系统配置" />

    <el-card shadow="hover">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="140px" style="max-width: 600px">
        <el-form-item label="公司名称" prop="companyName">
          <el-input v-model="form.companyName" placeholder="请输入公司名称" />
        </el-form-item>
        <el-form-item label="系统标题" prop="systemTitle">
          <el-input v-model="form.systemTitle" placeholder="请输入系统标题" />
        </el-form-item>
        <el-form-item label="默认仓库" prop="defaultWarehouse">
          <el-input v-model="form.defaultWarehouse" placeholder="请输入默认仓库" />
        </el-form-item>
        <el-form-item label="不良率预警阈值(%)" prop="defectRateThreshold">
          <el-input-number v-model="form.defectRateThreshold" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="库存预警阈值" prop="stockWarningThreshold">
          <el-input-number v-model="form.stockWarningThreshold" :min="0" />
        </el-form-item>
        <el-form-item label="自动备份" prop="autoBackup">
          <el-switch v-model="form.autoBackup" />
        </el-form-item>
        <el-form-item label="备份保留天数" prop="backupRetentionDays" v-if="form.autoBackup">
          <el-input-number v-model="form.backupRetentionDays" :min="1" :max="365" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSave">保存配置</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { getSystemConfig, updateSystemConfig } from '@/api/system'

const formRef = ref<FormInstance>()
const form = reactive({
  companyName: '注塑厂',
  systemTitle: '注塑厂管理系统',
  defaultWarehouse: '',
  defectRateThreshold: 5,
  stockWarningThreshold: 100,
  autoBackup: true,
  backupRetentionDays: 30,
})

const formRules: FormRules = {
  companyName: [{ required: true, message: '请输入公司名称', trigger: 'blur' }],
  systemTitle: [{ required: true, message: '请输入系统标题', trigger: 'blur' }],
}

async function loadConfig() {
  try {
    const res: any = await getSystemConfig()
    if (res.data) Object.assign(form, res.data)
  } catch { /* */ }
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await updateSystemConfig(form)
    ElMessage.success('保存成功')
  } catch { /* */ }
}

function handleReset() { loadConfig() }

onMounted(() => { loadConfig() })
</script>
