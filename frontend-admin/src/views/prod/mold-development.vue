<template>
  <div class="page-container mold-development-page">
    <PageHeader title="模具开发中心" subtitle="从需求立项、试模修模到量产移交，统一管理模具开发证据和生命周期数据">
      <el-button plain :loading="loading || contextLoading" @click="refreshAll">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="openForm('project')">
        <el-icon><Plus /></el-icon>
        新建开发项目
      </el-button>
    </PageHeader>

    <el-alert v-if="errorMessage" type="warning" :title="errorMessage" show-icon :closable="false" />

    <MetricStrip :items="metricItems" testid="mold-development-metrics" />

    <section class="development-overview">
      <div class="flow-panel">
        <div class="section-heading">
          <div>
            <h3>开发流程</h3>
            <p>项目推进时同步更新节点、试模和量产放行状态。</p>
          </div>
          <el-tag type="info" effect="plain">共 {{ projectTotal }} 个项目</el-tag>
        </div>
        <div class="stage-track">
          <div
            v-for="(stage, index) in MOLD_DEVELOPMENT_STAGES"
            :key="stage.code"
            class="stage-item"
            :class="stageState(stage.code)"
          >
            <span class="stage-index">{{ index + 1 }}</span>
            <span class="stage-label">{{ stage.label }}</span>
            <span v-if="index < MOLD_DEVELOPMENT_STAGES.length - 1" class="stage-arrow">→</span>
          </div>
        </div>
      </div>

      <div class="risk-panel">
        <div class="section-heading">
          <div>
            <h3>当前风险</h3>
            <p>优先处理逾期、寿命和试模返修项目。</p>
          </div>
          <el-tag v-if="selectedProject" type="info" effect="plain">{{ selectedProject.projectNo }}</el-tag>
        </div>
        <div class="risk-list">
          <button v-for="item in topRisks" :key="item.key" type="button" class="risk-row" @click="activeTab = item.tab">
            <span>{{ item.label }}</span>
            <el-tag :type="item.type" effect="plain">{{ item.value }}</el-tag>
          </button>
          <el-empty v-if="!topRisks.length" description="暂无风险" :image-size="46" />
        </div>
      </div>
    </section>

    <el-tabs v-model="activeTab" v-loading="loading || contextLoading" type="border-card" class="development-tabs">
      <el-tab-pane label="开发项目" name="projects">
        <div class="tab-toolbar">
          <el-input
            v-model.trim="projectKeyword"
            clearable
            placeholder="搜索项目号、项目名称、需求"
            @keyup.enter="handleProjectSearch"
            @clear="handleProjectSearch"
          />
          <el-button type="primary" plain @click="openForm('project')">
            <el-icon><Plus /></el-icon>
            新建项目
          </el-button>
        </div>
        <el-table
          :data="projects"
          stripe
          row-key="id"
          highlight-current-row
          :current-row-key="selectedProjectId || undefined"
          @row-click="selectProject"
        >
          <el-table-column prop="projectNo" label="项目号" min-width="150" fixed />
          <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="模具 / 产品" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ moldName(row.moldId) }} / {{ productName(row.productId) }}</template>
          </el-table-column>
          <el-table-column label="阶段" width="110">
            <template #default="{ row }">{{ stageLabel(row.currentStage) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }"><el-tag :type="statusTagType(row.status)" effect="plain">{{ projectStatus(row.status) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="交期" width="120"><template #default="{ row }">{{ dateText(row.plannedDueDate) }}</template></el-table-column>
          <el-table-column label="风险" width="90"><template #default="{ row }"><el-tag :type="riskTagType(row.riskLevel)" effect="plain">{{ textOf(row.riskLevel, '正常') }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openForm('project', row)">编辑</el-button>
              <el-button link type="success" @click.stop="advanceProject(row)">推进节点</el-button>
              <el-button link @click.stop="openForm('milestone', { projectId: row.id })">节点</el-button>
              <el-button link type="danger" @click.stop="removeRecord('mold-development-projects', row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="project-pagination">
          <el-pagination
            v-model:current-page="projectPage"
            v-model:page-size="projectPageSize"
            :total="projectTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="handleProjectPageChange"
            @size-change="handleProjectPageSizeChange"
          />
        </div>

        <div v-if="selectedProject" class="project-context-bar">
          <div>
            <strong>{{ selectedProject.projectName }}</strong>
            <span>{{ stageLabel(selectedProject.currentStage) }} · {{ userName(selectedProject.ownerId) }}</span>
          </div>
          <div class="project-context-bar__gate">
            <el-tag :type="gatePreview.passed ? 'success' : 'warning'" effect="plain">
              下一节点：{{ gatePreview.nextStage ? stageLabel(gatePreview.nextStage) : '已完成' }}
            </el-tag>
            <span>{{ gatePreview.passed ? '放行条件已满足' : gatePreview.blockers[0] || '请补齐阶段交付物' }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <section class="detail-section">
            <div class="section-heading">
              <div>
                <h3>项目里程碑</h3>
                <p>{{ selectedProject ? selectedProject.projectName : '请选择一个开发项目' }}</p>
              </div>
              <el-button plain size="small" :disabled="!selectedProjectId" @click="openForm('milestone', { projectId: selectedProjectId })">新增节点</el-button>
            </div>
            <el-table :data="selectedMilestones" size="small" stripe>
              <el-table-column prop="sequenceNo" label="#" width="55" />
              <el-table-column prop="stageName" label="节点" min-width="110" />
              <el-table-column prop="plannedDate" label="计划" width="110" />
              <el-table-column prop="actualDate" label="完成" width="110" />
              <el-table-column label="状态" width="95"><template #default="{ row }"><el-tag :type="milestoneTagType(row.status)" effect="plain">{{ milestoneStatus(row.status) }}</el-tag></template></el-table-column>
              <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openForm('milestone', row)">编辑</el-button></template></el-table-column>
            </el-table>
          </section>
          <section class="detail-section project-summary" v-if="selectedProject">
            <div class="section-heading"><div><h3>项目摘要</h3><p>关键开发约束与预算执行</p></div></div>
            <dl>
              <div><dt>负责人</dt><dd>{{ userName(selectedProject.ownerId) }}</dd></div>
              <div><dt>供应商</dt><dd>{{ supplierName(selectedProject.supplierId) }}</dd></div>
              <div><dt>目标周期</dt><dd>{{ numberText(selectedProject.targetCycleSeconds) }} 秒</dd></div>
              <div><dt>预算 / 实际</dt><dd>{{ money(selectedProject.budgetAmount) }} / {{ money(projectActualCost(selectedProject)) }}</dd></div>
              <div><dt>年度需求</dt><dd>{{ numberText(selectedProject.annualDemand) }}</dd></div>
              <div><dt>需求说明</dt><dd class="summary-text">{{ textOf(selectedProject.requirement) }}</dd></div>
            </dl>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="试模与验收" name="trials">
        <div class="tab-toolbar">
          <el-input v-model.trim="trialKeyword" clearable placeholder="搜索试模号、缺陷和修模措施" />
          <el-button type="primary" plain @click="openForm('trial')"><el-icon><Plus /></el-icon>新增试模记录</el-button>
        </div>
        <el-table :data="filteredTrials" stripe row-key="id">
          <el-table-column prop="trialNo" label="试模号" min-width="145" fixed />
          <el-table-column label="项目" min-width="150" show-overflow-tooltip><template #default="{ row }">{{ projectName(row.projectId) }}</template></el-table-column>
          <el-table-column prop="trialStage" label="阶段" width="85" />
          <el-table-column prop="shotCount" label="模次" width="85" align="right" />
          <el-table-column prop="cycleSeconds" label="周期(秒)" width="100" align="right" />
          <el-table-column label="检测结果" min-width="180"><template #default="{ row }">{{ resultText(row) }}</template></el-table-column>
          <el-table-column label="问题" min-width="150">
            <template #default="{ row }">
              <div class="issue-cell">
                <el-tag :type="issueSeverityTagType(row.issueSeverity)" effect="plain" size="small">{{ issueSeverityText(row.issueSeverity) }}</el-tag>
                <span>{{ issueStatusText(row.correctionStatus) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="correctionDueDate" label="整改期限" width="110" />
          <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="trialTagType(row.status)" effect="plain">{{ trialStatus(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="320" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openForm('trial', row)">编辑</el-button>
              <el-button
                v-if="trialIssueAction(row)"
                link
                :type="trialIssueAction(row)?.type"
                @click="handleTrialIssueAction(row)"
              >{{ trialIssueAction(row)?.label }}</el-button>
              <el-button link type="success" @click="approveTrial(row)">量产放行</el-button>
              <el-button link type="danger" @click="removeRecord('mold-trial-details', row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="版本与附件" name="versions">
        <div class="dual-section">
          <section class="detail-section">
            <div class="section-heading"><div><h3>模具版本 / 设计变更</h3><p>版本生效前必须完成审批，历史版本保留只读记录。</p></div><el-button type="primary" plain @click="openForm('revision')"><el-icon><Plus /></el-icon>新增版本</el-button></div>
            <el-table :data="revisions" stripe row-key="id">
              <el-table-column prop="revisionNo" label="版本" width="90" />
              <el-table-column prop="drawingNo" label="图号" min-width="120" />
              <el-table-column prop="changeType" label="变更类型" width="100" />
              <el-table-column prop="changeReason" label="变更原因" min-width="180" show-overflow-tooltip />
              <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="revisionTagType(row.status)" effect="plain">{{ revisionStatus(row.status) }}</el-tag></template></el-table-column>
              <el-table-column label="操作" width="250">
                <template #default="{ row }">
                  <el-button v-if="row.status === 'DRAFT'" link type="primary" @click="openForm('revision', row)">编辑</el-button>
                  <el-button v-if="row.status === 'DRAFT'" link type="warning" @click="changeRevisionStatus(row, 'SUBMIT')">提交</el-button>
                  <el-button v-if="row.status === 'PENDING_APPROVAL'" link type="success" @click="changeRevisionStatus(row, 'APPROVE')">批准生效</el-button>
                  <el-button v-if="row.status === 'DRAFT'" link type="danger" @click="removeRecord('mold-revisions', row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>
          <section class="detail-section">
            <div class="section-heading"><div><h3>图纸与验收附件</h3><p>文件存储在 Supabase Storage，数据库保存版本和访问地址。</p></div><el-button type="primary" plain @click="openForm('attachment')"><el-icon><Upload /></el-icon>登记附件</el-button></div>
            <el-table :data="attachments" stripe row-key="id">
              <el-table-column prop="fileName" label="文件" min-width="170" show-overflow-tooltip />
              <el-table-column prop="attachmentType" label="类型" width="95" />
              <el-table-column prop="versionNo" label="版本" width="80" />
              <el-table-column label="项目" min-width="130" show-overflow-tooltip><template #default="{ row }">{{ projectName(row.projectId) }}</template></el-table-column>
              <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" @click="openAttachment(row)">打开</el-button><el-button link type="danger" @click="removeRecord('mold-attachments', row)">删除</el-button></template></el-table-column>
            </el-table>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="产品与穴位" name="products">
        <div class="tab-toolbar"><span class="tab-hint">支持一套模具对应多个产品，并记录每个产品的穴位区间。</span><el-button type="primary" plain @click="openForm('moldProduct')"><el-icon><Plus /></el-icon>新增产品穴位</el-button></div>
        <el-table :data="moldProducts" stripe row-key="id">
          <el-table-column label="模具" min-width="150"><template #default="{ row }">{{ moldName(row.moldId) }}</template></el-table-column>
          <el-table-column label="产品" min-width="170"><template #default="{ row }">{{ productName(row.productId) }}</template></el-table-column>
          <el-table-column label="穴位" width="110"><template #default="{ row }">{{ cavityText(row) }}</template></el-table-column>
          <el-table-column prop="priority" label="优先级" width="85" />
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="plain">{{ row.status === 'ACTIVE' ? '启用' : '停用' }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="145"><template #default="{ row }"><el-button link type="primary" @click="openForm('moldProduct', row)">编辑</el-button><el-button link type="danger" @click="removeRecord('mold-products', row)">删除</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="零件与成本" name="components">
        <div class="dual-section">
          <section class="detail-section">
            <div class="section-heading"><div><h3>模具零件寿命</h3><p>按零件跟踪更换周期和备件风险。</p></div><el-button type="primary" plain @click="openForm('component')"><el-icon><Plus /></el-icon>新增零件</el-button></div>
            <el-table :data="components" stripe row-key="id">
              <el-table-column prop="componentCode" label="零件编码" width="120" />
              <el-table-column prop="componentName" label="零件名称" min-width="140" show-overflow-tooltip />
              <el-table-column label="模具" min-width="120"><template #default="{ row }">{{ moldName(row.moldId) }}</template></el-table-column>
              <el-table-column label="寿命进度" width="120"><template #default="{ row }">{{ componentLifeText(row) }}</template></el-table-column>
              <el-table-column label="状态" width="95"><template #default="{ row }"><el-tag :type="componentTagType(row)" effect="plain">{{ componentStatus(row.status) }}</el-tag></template></el-table-column>
              <el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" @click="openForm('component', row)">编辑</el-button><el-button link type="danger" @click="removeRecord('mold-components', row)">删除</el-button></template></el-table-column>
            </el-table>
          </section>
          <section class="detail-section">
            <div class="section-heading"><div><h3>开发成本</h3><p>对比报价、实际费用和修模投入。</p></div><el-button type="primary" plain @click="openForm('cost')"><el-icon><Plus /></el-icon>新增成本</el-button></div>
            <el-table :data="costs" stripe row-key="id">
              <el-table-column prop="costType" label="费用类型" width="100" />
              <el-table-column prop="sourceNo" label="来源单号" min-width="120" />
              <el-table-column prop="quotedAmount" label="报价" width="100" align="right"><template #default="{ row }">{{ money(row.quotedAmount) }}</template></el-table-column>
              <el-table-column prop="actualAmount" label="实际" width="100" align="right"><template #default="{ row }">{{ money(row.actualAmount) }}</template></el-table-column>
              <el-table-column prop="occurredAt" label="发生日期" width="110" />
              <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" @click="openForm('cost', row)">编辑</el-button><el-button link type="danger" @click="removeRecord('mold-cost-records', row)">删除</el-button></template></el-table-column>
            </el-table>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="供应商评价" name="suppliers">
        <div class="tab-toolbar"><span class="tab-hint">交期、质量、响应三项评分用于后续供应商选择。</span><el-button type="primary" plain @click="openForm('evaluation')"><el-icon><Plus /></el-icon>新增评价</el-button></div>
        <el-table :data="evaluations" stripe row-key="id">
          <el-table-column label="供应商" min-width="160"><template #default="{ row }">{{ supplierName(row.supplierId) }}</template></el-table-column>
          <el-table-column label="项目" min-width="150"><template #default="{ row }">{{ projectName(row.projectId) }}</template></el-table-column>
          <el-table-column prop="deliveryScore" label="交期" width="85" align="right" />
          <el-table-column prop="qualityScore" label="质量" width="85" align="right" />
          <el-table-column prop="responseScore" label="响应" width="85" align="right" />
          <el-table-column prop="totalScore" label="总分" width="85" align="right" />
          <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="row.evaluationStatus === 'APPROVED' ? 'success' : 'info'" effect="plain">{{ row.evaluationStatus === 'APPROVED' ? '已确认' : '草稿' }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="145"><template #default="{ row }"><el-button link type="primary" @click="openForm('evaluation', row)">编辑</el-button><el-button link type="danger" @click="removeRecord('mold-supplier-evaluations', row)">删除</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="寿命预测" name="life">
        <div class="tab-toolbar"><span class="tab-hint">基于近30天报工模次计算日均使用量，辅助安排保养和换模。</span><el-button plain @click="loadForecasts">重新计算</el-button></div>
        <el-table :data="forecasts" stripe row-key="moldId">
          <el-table-column prop="moldCode" label="模具" width="120" fixed />
          <el-table-column prop="moldName" label="名称" min-width="140" />
          <el-table-column prop="usedShots" label="已用模次" width="105" align="right" />
          <el-table-column prop="remainingShots" label="剩余寿命" width="105" align="right" />
          <el-table-column prop="avgDailyShots" label="日均模次" width="100" align="right" />
          <el-table-column label="预计剩余天数" width="120" align="right"><template #default="{ row }">{{ row.estimatedDaysToLife !== null && row.estimatedDaysToLife !== undefined ? numberText(row.estimatedDaysToLife, 1) : '-' }}</template></el-table-column>
          <el-table-column label="风险" width="110"><template #default="{ row }"><el-tag :type="riskTagType(row.riskLevel)" effect="plain">{{ riskText(row.riskLevel) }}</el-tag></template></el-table-column>
          <el-table-column label="动作" width="150"><template #default="{ row }"><el-button link type="warning" @click="openForm('component', { moldId: row.moldId })">查看零件</el-button><el-button link type="primary" @click="openMaintenance(row)">保养计划</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="formVisible" :title="formTitle" width="min(860px, calc(100vw - 24px))" destroy-on-close>
      <el-form label-width="115px" :model="form" class="development-form">
        <el-row :gutter="14">
          <el-col v-for="field in currentFields" :key="field.prop" :span="field.type === 'textarea' ? 24 : 12">
            <el-form-item :label="field.label" :required="field.required">
              <el-select v-if="field.lookup" v-model="form[field.prop]" filterable clearable class="full-input">
                <el-option v-for="option in lookupOptions(field.lookup)" :key="String(option.value)" :label="option.label" :value="option.value" />
              </el-select>
              <el-select v-else-if="field.type === 'select'" v-model="form[field.prop]" clearable class="full-input">
                <el-option v-for="option in field.options || []" :key="String(option.value)" :label="option.label" :value="option.value" />
              </el-select>
              <el-input-number v-else-if="field.type === 'number'" v-model="form[field.prop]" :min="field.min" :max="field.max" controls-position="right" class="full-input" />
              <el-date-picker v-else-if="field.type === 'date'" v-model="form[field.prop]" type="date" value-format="YYYY-MM-DD" class="full-input" />
              <el-date-picker v-else-if="field.type === 'datetime'" v-model="form[field.prop]" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" class="full-input" />
              <el-switch v-else-if="field.type === 'boolean'" v-model="form[field.prop]" />
              <el-input v-else-if="field.type === 'textarea'" v-model="form[field.prop]" type="textarea" :rows="3" />
              <el-input v-else v-model="form[field.prop]" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-upload v-if="formKind === 'attachment'" :show-file-list="false" :before-upload="handleFileUpload">
          <el-button plain><el-icon><Upload /></el-icon>选择并上传附件</el-button>
          <span class="upload-hint">{{ form.fileUrl ? '已生成文件地址，可保存登记' : '支持图纸、检验报告和试模照片' }}</span>
        </el-upload>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Upload } from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
  advanceMoldDevelopmentProject,
  createMoldDevelopmentRecord,
  deleteMoldDevelopmentRecord,
  getMoldDevelopmentFileUrl,
  getMoldDevelopmentList,
  releaseMoldTrialRecord,
  transitionMoldTrialIssue,
  transitionMoldRevision,
  updateMoldDevelopmentRecord,
  uploadMoldDevelopmentFile,
  type MoldTrialIssueAction,
} from '@/api/moldDevelopment'
import { getErrorMessage } from '@/utils/error-message'
import {
  MOLD_COMPONENT_STATUS_OPTIONS,
  MOLD_COST_TYPE_OPTIONS,
  MOLD_DEVELOPMENT_STAGES,
  MOLD_PROJECT_STATUS_OPTIONS,
  MOLD_REVISION_STATUS_OPTIONS,
  MOLD_TRIAL_ISSUE_SEVERITY_OPTIONS,
  MOLD_TRIAL_ISSUE_STATUS_OPTIONS,
  MOLD_TRIAL_RETEST_RESULT_OPTIONS,
  MOLD_TRIAL_STATUS_OPTIONS,
  buildMoldDevelopmentCode,
  calculateLifeForecast,
  numberOf,
  riskTagType,
  stageLabel,
  statusLabel,
  textOf,
  totalOf,
  validateMoldProjectStageGate,
  validateMoldTrialRelease,
} from '@/utils/mold-development'

type FormKind = 'project' | 'milestone' | 'trial' | 'revision' | 'attachment' | 'moldProduct' | 'component' | 'cost' | 'evaluation'
type LookupKey = 'projects' | 'molds' | 'products' | 'customers' | 'suppliers' | 'users' | 'trialRecords'
type Field = { prop: string; label: string; type?: string; required?: boolean; min?: number; max?: number; lookup?: LookupKey; options?: Array<{ label: string; value: any }> }

const activeTab = ref('projects')
const loading = ref(false)
const contextLoading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const router = useRouter()
const projectKeyword = ref('')
const trialKeyword = ref('')
const projectPage = ref(1)
const projectPageSize = ref(20)
const projectTotal = ref(0)
const selectedProjectId = ref<number | null>(null)
const formVisible = ref(false)
const formKind = ref<FormKind>('project')
const editingId = ref(0)
const form = reactive<Record<string, any>>({})

const projects = ref<any[]>([])
const milestones = ref<any[]>([])
const trials = ref<any[]>([])
const revisions = ref<any[]>([])
const attachments = ref<any[]>([])
const moldProducts = ref<any[]>([])
const components = ref<any[]>([])
const costs = ref<any[]>([])
const evaluations = ref<any[]>([])
const forecasts = ref<any[]>([])
const molds = ref<any[]>([])
const products = ref<any[]>([])
const customers = ref<any[]>([])
const suppliers = ref<any[]>([])
const users = ref<any[]>([])
const trialRecords = ref<any[]>([])
const loadedTabs = new Set<string>()
let contextRequestId = 0
let projectRequestId = 0

const field = (prop: string, label: string, type = 'text', extra: Partial<Field> = {}): Field => ({ prop, label, type, ...extra })
const formFieldMap: Record<FormKind, Field[]> = {
  project: [
    field('projectNo', '项目编号', 'text', { required: true }), field('projectName', '项目名称', 'text', { required: true }),
    field('moldId', '模具', 'select', { lookup: 'molds' }), field('productId', '主产品', 'select', { lookup: 'products' }),
    field('customerId', '客户', 'select', { lookup: 'customers' }), field('supplierId', '模具供应商', 'select', { lookup: 'suppliers' }),
    field('moldType', '模具类型'), field('cavityCount', '穴数', 'number', { min: 1 }), field('targetMachineTonnage', '目标吨位', 'number', { min: 0 }),
    field('targetCycleSeconds', '目标周期(秒)', 'number', { min: 0 }), field('annualDemand', '年度需求', 'number', { min: 0 }), field('budgetAmount', '预算金额', 'number', { min: 0 }),
    field('plannedStartDate', '计划开始', 'date'), field('plannedDueDate', '计划交期', 'date'),
    field('ownerId', '负责人', 'select', { lookup: 'users' }), field('riskLevel', '风险', 'select', { options: [{ label: '正常', value: 'NORMAL' }, { label: '关注', value: 'WARNING' }, { label: '高风险', value: 'HIGH' }] }),
    field('requirement', '需求说明', 'textarea', { required: true }), field('remark', '备注', 'textarea'),
  ],
  milestone: [
    field('projectId', '开发项目', 'select', { required: true, lookup: 'projects' }), field('stageCode', '节点', 'select', { required: true, options: MOLD_DEVELOPMENT_STAGES.map((item) => ({ label: item.label, value: item.code })) }),
    field('stageName', '节点名称', 'text', { required: true }), field('sequenceNo', '顺序', 'number', { min: 1 }), field('plannedDate', '计划日期', 'date'), field('actualDate', '完成日期', 'date'),
    field('ownerId', '负责人', 'select', { lookup: 'users' }), field('status', '状态', 'select', { options: [{ label: '待开始', value: 'PENDING' }, { label: '进行中', value: 'IN_PROGRESS' }, { label: '已完成', value: 'DONE' }, { label: '阻塞', value: 'BLOCKED' }] }),
    field('deliverable', '交付物', 'textarea'), field('riskNote', '风险说明', 'textarea'), field('remark', '备注', 'textarea'),
  ],
  trial: [
    field('projectId', '开发项目', 'select', { required: true, lookup: 'projects' }), field('trialMoldRecordId', '原试模记录', 'select', { lookup: 'trialRecords' }), field('trialNo', '试模编号', 'text', { required: true }),
    field('trialStage', '试模阶段', 'select', { options: [{ label: 'T0', value: 'T0' }, { label: 'T1', value: 'T1' }, { label: 'T2', value: 'T2' }, { label: '小批验证', value: 'PILOT' }] }), field('shotCount', '试模模次', 'number', { min: 0 }), field('cycleSeconds', '实际周期(秒)', 'number', { min: 0 }),
    field('moldTemp', '模温', 'number', { min: 0 }), field('materialTemp', '料温', 'number', { min: 0 }), field('dimensionResult', '尺寸结果', 'select', { options: [{ label: '待检', value: 'PENDING' }, { label: '通过', value: 'PASS' }, { label: '不通过', value: 'FAIL' }] }),
    field('qualityResult', '质量结果', 'select', { options: [{ label: '待检', value: 'PENDING' }, { label: '通过', value: 'PASS' }, { label: '不通过', value: 'FAIL' }] }), field('productionResult', '生产结果', 'select', { options: [{ label: '待验证', value: 'PENDING' }, { label: '通过', value: 'PASS' }, { label: '不通过', value: 'FAIL' }] }),
    field('firstPass', '首件通过', 'boolean'), field('nextTrialDate', '下次试模日期', 'date'), field('status', '状态', 'select', { options: [...MOLD_TRIAL_STATUS_OPTIONS] }),
    field('ownerId', '负责人', 'select', { lookup: 'users' }), field('defectSummary', '缺陷汇总', 'textarea'), field('correctionAction', '修模措施', 'textarea'),
    field('issueSeverity', '问题严重度', 'select', { options: [...MOLD_TRIAL_ISSUE_SEVERITY_OPTIONS] }), field('issueOwnerId', '整改责任人', 'select', { lookup: 'users' }), field('correctionDueDate', '整改期限', 'date'),
    field('retestResult', '复试结果', 'select', { options: [...MOLD_TRIAL_RETEST_RESULT_OPTIONS] }), field('remark', '确认说明', 'textarea'),
  ],
  revision: [
    field('projectId', '开发项目', 'select', { lookup: 'projects' }), field('moldId', '模具', 'select', { required: true, lookup: 'molds' }), field('revisionNo', '版本号', 'text', { required: true }),
    field('drawingNo', '图号'), field('changeType', '变更类型', 'select', { options: [{ label: '设计变更', value: 'DESIGN' }, { label: '材料变更', value: 'MATERIAL' }, { label: '尺寸变更', value: 'DIMENSION' }, { label: '修模变更', value: 'REWORK' }] }),
    field('changeReason', '变更原因', 'textarea', { required: true }), field('changeSummary', '变更摘要', 'textarea'), field('fileName', '关联文件名'), field('fileUrl', '文件地址'), field('checksum', '文件校验值'),
  ],
  attachment: [
    field('projectId', '开发项目', 'select', { lookup: 'projects' }), field('moldId', '模具', 'select', { lookup: 'molds' }), field('attachmentType', '附件类型', 'select', { options: [{ label: 'DFM报告', value: 'DFM_REPORT' }, { label: '设计图纸', value: 'DRAWING' }, { label: '检验报告', value: 'INSPECTION' }, { label: '试模照片', value: 'TRIAL_PHOTO' }, { label: '验收资料', value: 'ACCEPTANCE' }, { label: '量产移交', value: 'HANDOVER' }, { label: '其他', value: 'OTHER' }] }),
    field('fileName', '文件名称', 'text', { required: true }), field('fileUrl', '文件地址', 'text', { required: true }), field('versionNo', '版本号'), field('checksum', '文件校验值'), field('status', '状态', 'select', { options: [{ label: '有效', value: 'ACTIVE' }, { label: '作废', value: 'VOID' }] }),
  ],
  moldProduct: [
    field('moldId', '模具', 'select', { required: true, lookup: 'molds' }), field('productId', '产品', 'select', { required: true, lookup: 'products' }), field('cavityStart', '起始穴', 'number', { min: 1 }), field('cavityEnd', '结束穴', 'number', { min: 1 }),
    field('cavityCount', '穴数', 'number', { min: 1 }), field('priority', '优先级', 'number', { min: 1 }), field('status', '状态', 'select', { options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }] }), field('effectiveFrom', '生效日期', 'date'), field('effectiveTo', '失效日期', 'date'), field('remark', '备注', 'textarea'),
  ],
  component: [
    field('projectId', '开发项目', 'select', { lookup: 'projects' }), field('moldId', '模具', 'select', { required: true, lookup: 'molds' }), field('componentCode', '零件编码', 'text', { required: true }), field('componentName', '零件名称', 'text', { required: true }),
    field('componentType', '零件类型'), field('material', '材质'), field('supplierId', '供应商', 'select', { lookup: 'suppliers' }), field('quantity', '数量', 'number', { min: 0 }), field('lifetimeShots', '零件寿命', 'number', { min: 0 }), field('usedShots', '已用模次', 'number', { min: 0 }), field('replacementCost', '更换成本', 'number', { min: 0 }),
    field('status', '状态', 'select', { options: [...MOLD_COMPONENT_STATUS_OPTIONS] }), field('location', '存放位置'), field('lastReplacedAt', '上次更换', 'date'), field('remark', '备注', 'textarea'),
  ],
  cost: [
    field('projectId', '开发项目', 'select', { lookup: 'projects' }), field('moldId', '模具', 'select', { lookup: 'molds' }), field('supplierId', '供应商', 'select', { lookup: 'suppliers' }), field('costType', '费用类型', 'select', { required: true, options: [...MOLD_COST_TYPE_OPTIONS] }),
    field('sourceNo', '来源单号'), field('quotedAmount', '报价金额', 'number', { min: 0 }), field('actualAmount', '实际金额', 'number', { min: 0 }), field('occurredAt', '发生日期', 'date'), field('status', '状态', 'select', { options: [{ label: '草稿', value: 'DRAFT' }, { label: '已确认', value: 'CONFIRMED' }] }), field('remark', '备注', 'textarea'),
  ],
  evaluation: [
    field('projectId', '开发项目', 'select', { lookup: 'projects' }), field('moldId', '模具', 'select', { lookup: 'molds' }), field('supplierId', '供应商', 'select', { required: true, lookup: 'suppliers' }), field('deliveryScore', '交期评分', 'number', { min: 0, max: 100 }), field('qualityScore', '质量评分', 'number', { min: 0, max: 100 }), field('responseScore', '响应评分', 'number', { min: 0, max: 100 }), field('evaluationStatus', '状态', 'select', { options: [{ label: '草稿', value: 'DRAFT' }, { label: '已确认', value: 'APPROVED' }] }), field('evaluatedAt', '评价日期', 'date'), field('remark', '评价说明', 'textarea'),
  ],
}

const currentFields = computed(() => formFieldMap[formKind.value])
const formTitle = computed(() => `${editingId.value ? '编辑' : '新增'}${({ project: '模具开发项目', milestone: '开发里程碑', trial: '试模验收记录', revision: '模具版本', attachment: '模具附件', moldProduct: '产品穴位关系', component: '模具零件', cost: '开发成本', evaluation: '供应商评价' } as Record<FormKind, string>)[formKind.value]}`)
const selectedProject = computed(() => projects.value.find((row) => Number(row.id) === Number(selectedProjectId.value)))
const selectedMilestones = computed(() => [...milestones.value].sort((a, b) => numberOf(a.sequenceNo) - numberOf(b.sequenceNo)))
const filteredTrials = computed(() => {
  const keyword = trialKeyword.value.toLowerCase()
  if (!keyword) return trials.value
  return trials.value.filter((row) => `${row.trialNo} ${row.defectSummary} ${row.correctionAction}`.toLowerCase().includes(keyword))
})
const gatePreview = computed(() => selectedProject.value
  ? validateMoldProjectStageGate(selectedProject.value, {
      milestones: milestones.value,
      trials: trials.value,
      revisions: revisions.value,
      attachments: attachments.value,
    })
  : { passed: false, blockers: ['请选择开发项目'], warnings: [], nextStage: null })
const metricItems = computed(() => [
  { label: '开发项目', value: projectTotal.value, meta: '全部项目', tone: 'primary' as const },
  { label: '当前阶段', value: selectedProject.value ? stageLabel(selectedProject.value.currentStage) : '-', meta: selectedProject.value?.projectNo || '请选择项目', tone: 'warning' as const },
  { label: '首件通过率', value: trials.value.length ? `${Math.round(trials.value.filter((row) => row.firstPass || row.status === 'APPROVED_PRODUCTION').length / trials.value.length * 100)}%` : '0%', meta: `${trials.value.length} 条当前项目试模`, tone: 'success' as const },
  { label: '未关闭问题', value: trials.value.filter((row) => !['NOT_REQUIRED', 'CLOSED'].includes(String(row.correctionStatus || '').toUpperCase())).length, meta: '当前项目整改项', tone: 'danger' as const },
  { label: '实际开发成本', value: money(totalOf(costs.value, 'actualAmount')), meta: `${costs.value.length} 条当前项目成本`, tone: 'neutral' as const },
])
const topRisks = computed(() => {
  if (!selectedProject.value) return []
  const overdueProjects = selectedProject.value.plannedDueDate
    && new Date(selectedProject.value.plannedDueDate).getTime() < Date.now()
    && !['CLOSED', 'MASS_PRODUCTION'].includes(String(selectedProject.value.status || '').toUpperCase()) ? 1 : 0
  const reworkTrials = trials.value.filter((row) => !['NOT_REQUIRED', 'CLOSED'].includes(String(row.correctionStatus || '').toUpperCase())).length
  const lifeRisks = forecasts.value.filter((row) => ['OVERDUE', 'MAINTENANCE', 'WARNING'].includes(String(row.riskLevel || '').toUpperCase())).length
  return [
    { key: 'project', label: '项目交期风险', value: overdueProjects, type: overdueProjects ? 'danger' as const : 'success' as const, tab: 'projects' },
    { key: 'trial', label: '未关闭试模问题', value: reworkTrials, type: reworkTrials ? 'warning' as const : 'success' as const, tab: 'trials' },
    { key: 'life', label: '寿命 / 保养风险', value: lifeRisks, type: lifeRisks ? 'danger' as const : 'success' as const, tab: 'life' },
  ]
})

function pageResultOf(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  const records = Array.isArray(data) ? data : data ? [data] : []
  return { records, total: Number(res?.data?.total ?? records.length) }
}

async function fetchResource(resource: string, params: Record<string, any> = {}) {
  const res = await getMoldDevelopmentList(resource, { page: 1, pageSize: 200, ...params })
  return pageResultOf(res).records
}

async function loadLookupData() {
  const [moldRows, productRows, customerRows, supplierRows, userRows] = await Promise.all([
    fetchResource('molds', { pageSize: 500 }),
    fetchResource('products', { pageSize: 500 }),
    fetchResource('customers', { pageSize: 500 }),
    fetchResource('suppliers', { pageSize: 500 }),
    fetchResource('users', { pageSize: 500 }),
  ])
  molds.value = moldRows
  products.value = productRows
  customers.value = customerRows
  suppliers.value = supplierRows
  users.value = userRows
}

async function loadProjects() {
  const requestId = ++projectRequestId
  const requestPage = projectPage.value
  const requestPageSize = projectPageSize.value
  const requestKeyword = projectKeyword.value
  const res = await getMoldDevelopmentList('mold-development-projects', {
    page: requestPage,
    pageSize: requestPageSize,
    keyword: requestKeyword,
  })
  if (requestId !== projectRequestId
    || requestPage !== projectPage.value
    || requestPageSize !== projectPageSize.value
    || requestKeyword !== projectKeyword.value) return false
  const result = pageResultOf(res)
  projects.value = result.records
  projectTotal.value = result.total
  if (!projects.value.some((row) => Number(row.id) === Number(selectedProjectId.value))) {
    selectedProjectId.value = projects.value[0]?.id ? Number(projects.value[0].id) : null
  }
  return true
}

function clearProjectContext() {
  contextRequestId += 1
  loadedTabs.clear()
  milestones.value = []
  trials.value = []
  revisions.value = []
  attachments.value = []
  moldProducts.value = []
  components.value = []
  costs.value = []
  evaluations.value = []
  forecasts.value = []
  trialRecords.value = []
}

async function loadProjectCore(force = false) {
  const project = selectedProject.value
  if (!project) return
  if (!force && loadedTabs.has('core')) return
  const requestId = ++contextRequestId
  const params = { projectId: Number(project.id), pageSize: 200 }
  const [milestoneRows, trialRows, revisionRows, attachmentRows, costRows, forecastRows] = await Promise.all([
    fetchResource('mold-project-milestones', params),
    fetchResource('mold-trial-details', params),
    fetchResource('mold-revisions', params),
    fetchResource('mold-attachments', params),
    fetchResource('mold-cost-records', params),
    project.moldId ? fetchResource('mold-life-forecasts', { moldId: Number(project.moldId), pageSize: 20 }) : Promise.resolve([]),
  ])
  if (requestId !== contextRequestId || Number(project.id) !== Number(selectedProjectId.value)) return
  milestones.value = milestoneRows
  trials.value = trialRows
  revisions.value = revisionRows
  attachments.value = attachmentRows
  costs.value = costRows
  forecasts.value = forecastRows.map((row) => calculateLifeForecast(row))
  loadedTabs.add('core')
  loadedTabs.add('projects')
  loadedTabs.add('trials')
  loadedTabs.add('versions')
  loadedTabs.add('life')
}

async function loadActiveTabData(force = false) {
  const project = selectedProject.value
  const tab = activeTab.value
  if (!project || (!force && loadedTabs.has(tab))) return
  const requestId = contextRequestId
  const projectId = Number(project.id)
  let rows: any[] = []
  if (tab === 'products') {
    rows = project.moldId ? await fetchResource('mold-products', { moldId: Number(project.moldId), pageSize: 200 }) : []
  } else if (tab === 'components') {
    rows = await fetchResource('mold-components', { projectId, pageSize: 200 })
  } else if (tab === 'suppliers') {
    rows = await fetchResource('mold-supplier-evaluations', { projectId, pageSize: 200 })
  }
  if (requestId !== contextRequestId || projectId !== Number(selectedProjectId.value) || tab !== activeTab.value) return
  if (tab === 'products') moldProducts.value = rows
  else if (tab === 'components') components.value = rows
  else if (tab === 'suppliers') evaluations.value = rows
  loadedTabs.add(tab)
}

async function loadSelectedProjectContext(force = false) {
  if (!selectedProject.value) return
  contextLoading.value = true
  try {
    await loadProjectCore(force)
    await loadActiveTabData(force)
  } finally {
    contextLoading.value = false
  }
}

async function refreshAll() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [, projectsLoaded] = await Promise.all([loadLookupData(), loadProjects()])
    if (!projectsLoaded) return
    clearProjectContext()
    await loadSelectedProjectContext(true)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '模具开发数据加载失败，请先执行 database/supabase-mold-development.sql')
  } finally {
    loading.value = false
  }
}

async function loadForecasts() {
  const project = selectedProject.value
  if (!project?.moldId) {
    forecasts.value = []
    ElMessage.warning('当前项目尚未关联模具')
    return
  }
  try {
    forecasts.value = (await fetchResource('mold-life-forecasts', { moldId: Number(project.moldId), pageSize: 20 })).map((row) => calculateLifeForecast(row))
    ElMessage.success('寿命预测已重新计算')
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '寿命预测加载失败')
  }
}

async function selectProject(row: any) {
  const projectId = Number(row.id)
  if (projectId === Number(selectedProjectId.value)) return
  selectedProjectId.value = projectId
  clearProjectContext()
  await loadSelectedProjectContext(true)
}

async function handleProjectSearch() {
  projectPage.value = 1
  await reloadProjectPage()
}

async function handleProjectPageChange(page: number) {
  projectPage.value = page
  await reloadProjectPage()
}

async function handleProjectPageSizeChange(size: number) {
  projectPageSize.value = size
  projectPage.value = 1
  await reloadProjectPage()
}

async function reloadProjectPage() {
  contextLoading.value = true
  errorMessage.value = ''
  try {
    if (!await loadProjects()) return
    clearProjectContext()
    await loadSelectedProjectContext(true)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '开发项目加载失败')
  } finally {
    contextLoading.value = false
  }
}

function stageState(code: string) {
  const currentCode = String(selectedProject.value?.currentStage || '').toUpperCase()
  const currentIndex = MOLD_DEVELOPMENT_STAGES.findIndex((item) => item.code === currentCode)
  const stageIndex = MOLD_DEVELOPMENT_STAGES.findIndex((item) => item.code === code)
  return {
    'is-complete': currentIndex >= 0 && stageIndex < currentIndex,
    'is-current': stageIndex === currentIndex,
    'is-blocked': stageIndex === currentIndex + 1 && !gatePreview.value.passed,
  }
}

function lookupOptions(key: LookupKey) {
  const rows = ({ projects: projects.value, molds: molds.value, products: products.value, customers: customers.value, suppliers: suppliers.value, users: users.value, trialRecords: trialRecords.value } as Record<LookupKey, any[]>)[key]
  return rows.map((row) => ({
    label: key === 'projects'
      ? `${row.projectNo || row.id} ${row.projectName || ''}`
      : key === 'users'
        ? `${row.realName || row.username || row.phone || row.id}${row.username && row.realName ? `（${row.username}）` : ''}`
        : key === 'trialRecords'
          ? `${row.trialNo || row.id} ${row.firstArticleResult || ''}`
        : `${row.code || row.id} ${row.name || ''}`,
    value: row.id,
  }))
}
function projectName(id: unknown) { const row = projects.value.find((item) => Number(item.id) === Number(id)); return row ? `${row.projectNo} ${row.projectName}` : textOf(id) }
function moldName(id: unknown) { const row = molds.value.find((item) => Number(item.id) === Number(id)); return row ? `${row.code} ${row.name}` : textOf(id) }
function productName(id: unknown) { const row = products.value.find((item) => Number(item.id) === Number(id)); return row ? `${row.code} ${row.name}` : textOf(id) }
function supplierName(id: unknown) { const row = suppliers.value.find((item) => Number(item.id) === Number(id)); return row ? `${row.code} ${row.name}` : textOf(id) }
function userName(id: unknown) { const row = users.value.find((item) => Number(item.id) === Number(id)); return row ? `${row.realName || row.username}${row.username && row.realName ? `（${row.username}）` : ''}` : textOf(id) }
function dateText(value: unknown) { return String(value || '').slice(0, 10) || '-' }
function numberText(value: unknown, precision = 0) { return numberOf(value).toFixed(precision) }
function money(value: unknown) { return `¥${numberOf(value).toFixed(2)}` }
function projectActualCost(row: any) { return costs.value.filter((item) => Number(item.projectId) === Number(row.id)).reduce((sum, item) => sum + numberOf(item.actualAmount), 0) || numberOf(row.actualAmount) }
function projectStatus(value: unknown) { return statusLabel(MOLD_PROJECT_STATUS_OPTIONS, value) }
function trialStatus(value: unknown) { return statusLabel(MOLD_TRIAL_STATUS_OPTIONS, value) }
function issueSeverityText(value: unknown) { return statusLabel(MOLD_TRIAL_ISSUE_SEVERITY_OPTIONS, value) }
function issueStatusText(value: unknown) { return statusLabel(MOLD_TRIAL_ISSUE_STATUS_OPTIONS, value) }
function revisionStatus(value: unknown) { return statusLabel(MOLD_REVISION_STATUS_OPTIONS, value) }
function milestoneStatus(value: unknown) { return ({ PENDING: '待开始', IN_PROGRESS: '进行中', DONE: '已完成', BLOCKED: '阻塞' } as Record<string, string>)[String(value || '').toUpperCase()] || textOf(value) }
function componentStatus(value: unknown) { return statusLabel(MOLD_COMPONENT_STATUS_OPTIONS, value) }
function riskText(value: unknown) { return ({ NORMAL: '正常', WARNING: '预警', MAINTENANCE: '待保养', OVERDUE: '逾期' } as Record<string, string>)[String(value || '').toUpperCase()] || textOf(value) }
function statusTagType(value: unknown) { const status = String(value || '').toUpperCase(); return ['CLOSED', 'MASS_PRODUCTION', 'APPROVED'].includes(status) ? 'success' as const : ['ON_HOLD', 'ACCEPTANCE', 'TRIALING'].includes(status) ? 'warning' as const : ['CANCELLED', 'REWORK'].includes(status) ? 'danger' as const : 'info' as const }
function milestoneTagType(value: unknown) { const status = String(value || '').toUpperCase(); return status === 'DONE' ? 'success' as const : status === 'BLOCKED' ? 'danger' as const : status === 'IN_PROGRESS' ? 'warning' as const : 'info' as const }
function trialTagType(value: unknown) { const status = String(value || '').toUpperCase(); return status === 'APPROVED_PRODUCTION' ? 'success' as const : ['REWORK', 'FAIL'].includes(status) ? 'danger' as const : ['TRIALING', 'WAIT_CONFIRM'].includes(status) ? 'warning' as const : 'info' as const }
function issueSeverityTagType(value: unknown) { const severity = String(value || '').toUpperCase(); return ['HIGH', 'BLOCKER'].includes(severity) ? 'danger' as const : severity === 'MEDIUM' ? 'warning' as const : severity === 'LOW' ? 'success' as const : 'info' as const }
function revisionTagType(value: unknown) { return String(value || '').toUpperCase() === 'EFFECTIVE' ? 'success' as const : String(value || '').toUpperCase() === 'VOID' ? 'danger' as const : 'warning' as const }
function resultText(row: any) { return `尺寸 ${textOf(row.dimensionResult)} / 质量 ${textOf(row.qualityResult)} / 量产 ${textOf(row.productionResult)}` }
function cavityText(row: any) { return row.cavityStart || row.cavityEnd ? `${row.cavityStart || '-'}-${row.cavityEnd || '-'}（${row.cavityCount || 0}穴）` : `${row.cavityCount || 0}穴` }
function componentLifeText(row: any) { return numberOf(row.lifetimeShots) > 0 ? `${numberText(row.usedShots)} / ${numberText(row.lifetimeShots)}` : '未设置' }
function componentTagType(row: any) { const rate = numberOf(row.lifetimeShots) > 0 ? numberOf(row.usedShots) / numberOf(row.lifetimeShots) : 0; return row.status === 'REPLACED' ? 'info' as const : rate >= 1 ? 'danger' as const : rate >= 0.8 ? 'warning' as const : 'success' as const }

function trialIssueAction(row: any): { action: MoldTrialIssueAction; label: string; type: 'primary' | 'success' | 'warning' | 'info' } | null {
  if (!String(row.defectSummary || '').trim() || String(row.issueSeverity || '').toUpperCase() === 'NOT_REQUIRED') return null
  const status = String(row.correctionStatus || 'OPEN').toUpperCase()
  if (['NOT_REQUIRED', 'OPEN'].includes(status)) return { action: 'START', label: '开始整改', type: 'primary' }
  if (status === 'IN_PROGRESS') return { action: 'WAIT_RETEST', label: '提交复试', type: 'warning' }
  if (status === 'WAIT_RETEST' && String(row.retestResult || '').toUpperCase() === 'FAIL') return { action: 'START', label: '继续整改', type: 'warning' }
  if (status === 'WAIT_RETEST') return { action: 'CLOSE', label: '关闭问题', type: 'success' }
  if (status === 'CLOSED') return { action: 'REOPEN', label: '重开问题', type: 'info' }
  return null
}

function defaults(kind: FormKind) {
  const project = selectedProject.value
  const source: Record<FormKind, Record<string, any>> = {
    project: { projectNo: buildMoldDevelopmentCode('MDP'), projectName: '', moldId: null, productId: null, customerId: null, supplierId: null, moldType: '注塑模', cavityCount: 1, targetMachineTonnage: 0, targetCycleSeconds: 0, annualDemand: 0, budgetAmount: 0, plannedStartDate: '', plannedDueDate: '', currentStage: 'REQUIREMENT', ownerId: null, status: 'DRAFT', riskLevel: 'NORMAL', requirement: '', remark: '' },
    milestone: { projectId: selectedProjectId.value, stageCode: 'REQUIREMENT', stageName: '需求评审', sequenceNo: 1, plannedDate: '', actualDate: '', ownerId: null, status: 'PENDING', deliverable: '', riskNote: '', remark: '' },
    trial: { projectId: selectedProjectId.value, trialMoldRecordId: null, trialNo: buildMoldDevelopmentCode('TRIAL'), trialStage: 'T0', shotCount: 0, cycleSeconds: 0, moldTemp: 0, materialTemp: 0, dimensionResult: 'PENDING', qualityResult: 'PENDING', productionResult: 'PENDING', firstPass: false, nextTrialDate: '', status: 'DRAFT', ownerId: null, defectSummary: '', correctionAction: '', issueSeverity: 'NOT_REQUIRED', issueOwnerId: null, correctionDueDate: '', correctionStatus: 'NOT_REQUIRED', retestResult: 'NOT_REQUIRED', closureEvidence: '', remark: '' },
    revision: { projectId: selectedProjectId.value, moldId: project?.moldId || null, revisionNo: 'V1.0', drawingNo: '', changeType: 'DESIGN', changeReason: '', changeSummary: '', fileName: '', fileUrl: '', checksum: '', status: 'DRAFT', effectiveAt: '' },
    attachment: { projectId: selectedProjectId.value, moldId: project?.moldId || null, attachmentType: 'DRAWING', fileName: '', fileUrl: '', versionNo: '', checksum: '', status: 'ACTIVE' },
    moldProduct: { moldId: project?.moldId || null, productId: project?.productId || null, cavityStart: 1, cavityEnd: 1, cavityCount: 1, priority: 1, status: 'ACTIVE', effectiveFrom: '', effectiveTo: '', remark: '' },
    component: { projectId: selectedProjectId.value, moldId: project?.moldId || null, componentCode: '', componentName: '', componentType: '', material: '', supplierId: null, quantity: 1, lifetimeShots: 0, usedShots: 0, replacementCost: 0, status: 'ACTIVE', location: '', lastReplacedAt: '', remark: '' },
    cost: { projectId: selectedProjectId.value, moldId: project?.moldId || null, supplierId: null, costType: 'MACHINING', sourceNo: '', quotedAmount: 0, actualAmount: 0, occurredAt: '', status: 'DRAFT', remark: '' },
    evaluation: { projectId: selectedProjectId.value, moldId: project?.moldId || null, supplierId: project?.supplierId || null, deliveryScore: 0, qualityScore: 0, responseScore: 0, totalScore: 0, evaluationStatus: 'DRAFT', evaluatedAt: '', remark: '' },
  }
  return source[kind]
}

function openForm(kind: FormKind, row: Record<string, any> = {}) {
  if (kind !== 'project' && !selectedProjectId.value) {
    ElMessage.warning('请先选择一个模具开发项目')
    return
  }
  if (kind === 'trial') void ensureTrialRecordOptions()
  formKind.value = kind
  editingId.value = Number(row.id || 0)
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, defaults(kind), row)
  if (kind === 'milestone' && form.stageCode && !row.stageName) form.stageName = stageLabel(form.stageCode)
  formVisible.value = true
}

async function ensureTrialRecordOptions() {
  if (trialRecords.value.length || !selectedProjectId.value) return
  try {
    trialRecords.value = await fetchResource('trial-mold-records', { projectId: selectedProjectId.value, pageSize: 200 })
  } catch (error) {
    ElMessage.warning(getErrorMessage(error, '原试模记录加载失败'))
  }
}

function lookupResource(kind: FormKind) {
  return ({ project: 'mold-development-projects', milestone: 'mold-project-milestones', trial: 'mold-trial-details', revision: 'mold-revisions', attachment: 'mold-attachments', moldProduct: 'mold-products', component: 'mold-components', cost: 'mold-cost-records', evaluation: 'mold-supplier-evaluations' } as Record<FormKind, string>)[kind]
}

function requiredMissing() {
  return currentFields.value.find((item) => item.required && (form[item.prop] === undefined || form[item.prop] === null || String(form[item.prop]).trim() === ''))
}

async function saveForm() {
  const missing = requiredMissing()
  if (missing) { ElMessage.warning(`请填写${missing.label}`); return }
  if (formKind.value === 'evaluation') form.totalScore = ((numberOf(form.deliveryScore) + numberOf(form.qualityScore) + numberOf(form.responseScore)) / 3).toFixed(2)
  if (formKind.value === 'milestone') form.stageName = stageLabel(form.stageCode)
  if (formKind.value === 'trial') {
    const hasDefect = Boolean(String(form.defectSummary || '').trim())
    const severity = String(form.issueSeverity || 'NOT_REQUIRED').toUpperCase()
    if (hasDefect && severity === 'NOT_REQUIRED') { ElMessage.warning('存在缺陷时请选择问题严重度'); return }
    if (hasDefect && !String(form.correctionAction || '').trim()) { ElMessage.warning('存在缺陷时请填写修模措施'); return }
    if (hasDefect && ['HIGH', 'BLOCKER'].includes(severity) && !form.issueOwnerId) { ElMessage.warning('高风险问题必须指定整改责任人'); return }
    if (hasDefect && ['HIGH', 'BLOCKER'].includes(severity) && !form.correctionDueDate) { ElMessage.warning('高风险问题必须设置整改期限'); return }
    if (hasDefect && ['NOT_REQUIRED', ''].includes(String(form.correctionStatus || '').toUpperCase())) form.correctionStatus = 'OPEN'
    if (hasDefect && String(form.retestResult || '').toUpperCase() === 'NOT_REQUIRED') form.retestResult = 'PENDING'
    if (!hasDefect) {
      if (editingId.value && !['NOT_REQUIRED', ''].includes(String(form.correctionStatus || '').toUpperCase())) {
        ElMessage.warning('已进入整改流程的问题不能直接清空缺陷，请先按流程关闭')
        return
      }
      form.issueSeverity = 'NOT_REQUIRED'
      form.issueOwnerId = null
      form.correctionDueDate = ''
      form.correctionStatus = 'NOT_REQUIRED'
      form.retestResult = 'NOT_REQUIRED'
      form.closureEvidence = ''
    }
  }
  saving.value = true
  try {
    const resource = lookupResource(formKind.value)
    const result: any = editingId.value ? await updateMoldDevelopmentRecord(resource, editingId.value, { ...form }) : await createMoldDevelopmentRecord(resource, { ...form })
    const savedKind = formKind.value
    const savedProjectId = Number(result?.data?.id || editingId.value || 0)
    ElMessage.success('保存成功')
    formVisible.value = false
    if (savedKind === 'project') {
      if (!editingId.value) projectPage.value = 1
      if (savedProjectId) selectedProjectId.value = savedProjectId
      await loadProjects()
    }
    await refreshCurrentProject()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '保存失败，请检查数据库迁移和字段权限'))
  } finally { saving.value = false }
}

async function advanceProject(row: any) {
  try {
    if (Number(row.id) !== Number(selectedProjectId.value)) await selectProject(row)
    await loadProjectCore(true)
    const check = validateMoldProjectStageGate(row, {
      milestones: milestones.value,
      trials: trials.value,
      revisions: revisions.value,
      attachments: attachments.value,
    })
    if (!check.passed) {
      await ElMessageBox.alert(check.blockers.join('；'), '节点暂不能推进', { type: 'warning' })
      return
    }
    const result: any = await advanceMoldDevelopmentProject(Number(row.id))
    ElMessage.success(`已推进至${stageLabel(result?.data?.nextStage)}`)
    await loadProjects()
    await refreshCurrentProject()
  } catch (error) { ElMessage.error(getErrorMessage(error, '项目节点推进失败')) }
}

async function approveTrial(row: any) {
  const releaseCheck = validateMoldTrialRelease(row, attachments.value)
  if (!releaseCheck.passed) {
    ElMessage.warning(`暂不能放行：${releaseCheck.blockers.join('；')}`)
    return
  }
  try {
    await releaseMoldTrialRecord(Number(row.id))
    ElMessage.success(releaseCheck.warnings.length ? `试模已放行量产，${releaseCheck.warnings.join('；')}` : '试模已放行量产，请在项目列表推进至验收确认')
    await loadProjects()
    await refreshCurrentProject()
  } catch (error) { ElMessage.error(getErrorMessage(error, '试模放行失败')) }
}

async function handleTrialIssueAction(row: any) {
  const next = trialIssueAction(row)
  if (!next) return
  let evidence = ''
  if (next.action === 'CLOSE') {
    if (String(row.retestResult || '').toUpperCase() !== 'PASS') {
      ElMessage.warning('请先编辑试模记录并登记复试通过')
      return
    }
    try {
      const result = await ElMessageBox.prompt('填写复试结论或关闭证据', '关闭试模问题', {
        inputPlaceholder: '例如：T2复试尺寸及外观复核通过',
        inputValidator: (value) => Boolean(String(value || '').trim()) || '关闭证据不能为空',
        confirmButtonText: '关闭问题',
        cancelButtonText: '取消',
      })
      evidence = String(result.value || '').trim()
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      throw error
    }
  }
  try {
    await transitionMoldTrialIssue(Number(row.id), next.action, evidence)
    ElMessage.success(next.action === 'START' ? '已开始整改' : next.action === 'WAIT_RETEST' ? '已提交复试' : next.action === 'CLOSE' ? '问题已关闭' : '问题已重新打开')
    await refreshCurrentProject()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '试模问题状态更新失败'))
  }
}

async function changeRevisionStatus(row: any, action: 'SUBMIT' | 'APPROVE' | 'VOID') {
  try {
    await transitionMoldRevision(Number(row.id), action)
    ElMessage.success(action === 'SUBMIT' ? '版本已提交审批' : action === 'APPROVE' ? '版本已批准生效' : '版本已作废')
    await refreshCurrentProject()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '模具版本状态变更失败'))
  }
}

async function removeRecord(resource: string, row: any) {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.projectNo || row.trialNo || row.fileName || row.componentCode || row.id}？`, '删除确认', { type: 'warning' })
    await deleteMoldDevelopmentRecord(resource, Number(row.id))
    ElMessage.success('删除成功')
    if (resource === 'mold-development-projects') await loadProjects()
    await refreshCurrentProject()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error, '删除失败'))
  }
}

async function handleFileUpload(file: File) {
  try {
    const res: any = await uploadMoldDevelopmentFile(file)
    form.fileName = file.name
    form.fileUrl = res?.data?.url || ''
    ElMessage.success('附件上传成功，请点击保存登记')
  } catch (error) { ElMessage.error(getErrorMessage(error, '附件上传失败')) }
  return false
}

async function openAttachment(row: any) {
  if (!row.fileUrl) { ElMessage.warning('该附件没有可访问地址'); return }
  const previewWindow = window.open('', '_blank')
  if (previewWindow) previewWindow.opener = null
  try {
    const result: any = await getMoldDevelopmentFileUrl(String(row.fileUrl))
    const url = String(result?.data?.url || '')
    if (!url) throw new Error('未获取到附件访问地址')
    if (previewWindow) previewWindow.location.replace(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  } catch (error) {
    previewWindow?.close()
    ElMessage.error(getErrorMessage(error, '附件访问地址生成失败'))
  }
}

function openMaintenance(row: any) {
  router.push({ path: '/injection/mold-maintenance-plan', query: { moldId: row.moldId, keyword: row.moldCode || row.moldName || '' } })
}

async function refreshCurrentProject() {
  clearProjectContext()
  await loadSelectedProjectContext(true)
}

watch(activeTab, async () => {
  contextLoading.value = true
  try {
    await loadActiveTabData()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '当前项目标签数据加载失败')
  } finally {
    contextLoading.value = false
  }
})

onMounted(refreshAll)
</script>

<style scoped lang="scss">
.mold-development-page { gap: 14px; }
.development-overview, .dual-section, .detail-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.9fr); gap: 14px; }
.dual-section { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.flow-panel, .risk-panel, .detail-section { min-width: 0; border: 1px solid var(--ui-color-border); border-radius: var(--ui-radius-card); background: var(--ui-color-surface); box-shadow: var(--ui-shadow-card); padding: 14px 16px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.section-heading h3 { margin: 0; font-size: 15px; line-height: 22px; }
.section-heading p { margin: 3px 0 0; color: var(--ui-color-text-muted); font-size: 12px; line-height: 18px; }
.stage-track { display: flex; align-items: center; gap: 0; overflow-x: auto; padding: 12px 0 3px; }
.stage-item { position: relative; display: flex; align-items: center; gap: 7px; flex: 1 0 94px; min-width: 94px; color: var(--ui-color-text-secondary); font-size: 12px; }
.stage-index { display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; border: 1px solid #b8c7d9; border-radius: 50%; color: #32618f; background: #f6faff; font-weight: 700; }
.stage-label { white-space: nowrap; }
.stage-arrow { margin-left: auto; color: #a3b4c6; font-size: 16px; }
.stage-item.is-complete .stage-index { border-color: #67c23a; color: #fff; background: #67c23a; }
.stage-item.is-current { color: var(--el-color-primary); font-weight: 700; }
.stage-item.is-current .stage-index { border-color: var(--el-color-primary); color: #fff; background: var(--el-color-primary); }
.stage-item.is-blocked .stage-index { border-color: #e6a23c; color: #b26a00; background: #fdf6ec; }
.risk-list { display: grid; gap: 8px; }
.risk-row { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 36px; padding: 7px 10px; border: 0; border-bottom: 1px solid var(--ui-color-border-soft); color: var(--ui-color-text-secondary); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.risk-row:hover { color: var(--el-color-primary); background: var(--el-fill-color-light); }
.risk-row:last-child { border-bottom: 0; }
.development-tabs { min-width: 0; }
.tab-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.tab-toolbar > .el-input { max-width: 320px; }
.tab-hint { color: var(--ui-color-text-muted); font-size: 12px; }
.project-pagination { display: flex; justify-content: flex-end; padding-top: 12px; overflow-x: auto; }
.project-context-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 11px 14px; border: 1px solid var(--el-border-color-light); border-left: 3px solid var(--el-color-primary); border-radius: 6px; background: var(--el-fill-color-extra-light); }
.project-context-bar > div { display: grid; gap: 3px; min-width: 0; }
.project-context-bar strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-context-bar span { color: var(--ui-color-text-muted); font-size: 12px; }
.project-context-bar__gate { justify-items: end; max-width: 48%; text-align: right; }
.issue-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.issue-cell span { overflow: hidden; color: var(--ui-color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.detail-grid { margin-top: 14px; }
.project-summary dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin: 0; }
.project-summary dl > div { min-width: 0; }
.project-summary dt { color: var(--ui-color-text-muted); font-size: 12px; }
.project-summary dd { margin: 2px 0 0; color: var(--ui-color-text); font-weight: 600; line-height: 20px; }
.summary-text { grid-column: 1 / -1; font-weight: 400 !important; word-break: break-word; }
.full-input { width: 100%; }
.development-form :deep(.el-textarea__inner) { min-height: 76px; }
.upload-hint { margin-left: 10px; color: var(--ui-color-text-muted); font-size: 12px; }
@media (max-width: 1100px) { .development-overview, .dual-section, .detail-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .tab-toolbar, .project-context-bar { align-items: flex-start; flex-direction: column; } .tab-toolbar > .el-input { max-width: none; width: 100%; } .project-context-bar__gate { justify-items: start; max-width: none; text-align: left; } .project-summary dl { grid-template-columns: 1fr; } .development-form :deep(.el-col-12) { flex: 0 0 100%; max-width: 100%; } .development-form :deep(.el-form-item) { display: block; } .development-form :deep(.el-form-item__label) { width: auto !important; justify-content: flex-start; } }
</style>
