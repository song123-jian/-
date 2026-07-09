import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function assertIncludesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} should include ${value}`)
  }
}

const visualCss = read('../frontend-admin/src/styles/visual-system.css')
const mainSource = read('../frontend-admin/src/main.ts')
const loginSource = read('../frontend-admin/src/views/login/index.vue')
const layoutSource = read('../frontend-admin/src/layout/index.vue')
const pageHeaderSource = read('../frontend-admin/src/components/PageHeader.vue')
const searchBarSource = read('../frontend-admin/src/components/SearchBar.vue')
const salesMetricStripSource = read('../frontend-admin/src/components/SalesMetricStrip.vue')
const baseCrudTableSource = read('../frontend-admin/src/components/BaseCrudTable.vue')
const rowActionsSource = read('../frontend-admin/src/components/RowActions.vue')
const baseCrudFormSource = read('../frontend-admin/src/components/BaseCrudForm.vue')
const displayNumberSource = read('../frontend-admin/src/components/DisplayNumber.vue')
const metricCardSource = read('../frontend-admin/src/components/MetricCard.vue')
const metricStripSource = read('../frontend-admin/src/components/MetricStrip.vue')
const statusTagSource = read('../frontend-admin/src/components/StatusTag.vue')
const masterCrudPageSource = read('../frontend-admin/src/components/MasterCrudPage.vue')
const baseDataSchemaSource = read('../frontend-admin/src/views/base/base-data-schema.ts')
const baseCustomerSource = read('../frontend-admin/src/views/base/customers.vue')
const baseSupplierSource = read('../frontend-admin/src/views/base/suppliers.vue')
const baseProductSource = read('../frontend-admin/src/views/base/products.vue')
const dashboardSource = read('../frontend-admin/src/views/dashboard/index.vue')
const financeDashboardSource = read('../frontend-admin/src/views/finance/dashboard.vue')
const financeStatementsSource = read('../frontend-admin/src/views/finance/statements.vue')
const bossDashboardSource = read('../frontend-admin/src/views/report/boss-dashboard.vue')
const productionBoardSource = read('../frontend-admin/src/views/report/production-board.vue')
const qualityBoardSource = read('../frontend-admin/src/views/report/quality-board.vue')
const equipmentSparePartsSource = read('../frontend-admin/src/views/equipment/spare-parts.vue')
const processInspectionSource = read('../frontend-admin/src/views/qc/process-inspection.vue')
const defectDisposalSource = read('../frontend-admin/src/views/qc/defect-disposal.vue')
const purchaseOrdersSource = read('../frontend-admin/src/views/purchase/orders.vue')
const saleOrdersSource = read('../frontend-admin/src/views/sale/orders.vue')
const saleDeliveriesSource = read('../frontend-admin/src/views/sale/deliveries.vue')
const salePaymentsSource = read('../frontend-admin/src/views/sale/payments.vue')
const stockQuerySource = read('../frontend-admin/src/views/stock/query.vue')
const productizationSource = read('../frontend-admin/src/views/prod/productization.vue')
const salaryDailySource = read('../frontend-admin/src/views/salary/daily.vue')
const salaryAdjustSource = read('../frontend-admin/src/views/salary/adjust.vue')
const salaryMonthlySource = read('../frontend-admin/src/views/salary/monthly.vue')
const workbenchTodosSource = read('../frontend-admin/src/views/workbench/todos.vue')
const injectionModuleSource = read('../frontend-admin/src/views/injection/module.vue')
const notificationCenterSource = read('../frontend-admin/src/views/system/notifications.vue')
const cloudOpsSource = read('../frontend-admin/src/views/system/backup.vue')
const packageSource = read('../package.json')

describe('visual system delivery target', () => {
  it('loads the visual system stylesheet globally', () => {
    assert.ok(
      existsSync(new URL('../frontend-admin/src/styles/visual-system.css', import.meta.url)),
      'visual-system.css should exist',
    )
    assert.match(mainSource, /import ['"]\.\/styles\/visual-system\.css['"]/)
  })

  it('defines stable typography, icon and numeric tokens', () => {
    assertIncludesAll(visualCss, [
      '--ui-font-size-page-title',
      '--ui-font-size-body',
      '--ui-font-size-number',
      '--ui-line-height-number',
      '--ui-icon-button',
      '--ui-icon-menu',
      '--ui-header-height',
      '--ui-sidebar-width',
      '--ui-radius-card',
      '--ui-color-text',
      '--ui-color-accent',
      '--ui-color-sidebar',
      '--ui-shadow-panel',
      'font-variant-numeric: tabular-nums',
      'letter-spacing: 0',
    ], 'visual-system.css')
  })

  it('upgrades the admin launch page without changing login behavior', () => {
    assertIncludesAll(loginSource, [
      'class="login-brand"',
      'class="login-card"',
      'login-system-grid',
      'systemTiles',
      '云库质量追溯管理端',
      'isSupabaseConfigured',
      'resolvePostLoginPath',
      'userStore.loginAction(loginForm)',
      '@media (max-width: 920px)',
      '@media (max-width: 560px)',
    ], 'login page')
  })

  it('adds a denser admin shell context and responsive status area', () => {
    assertIncludesAll(layoutSource, [
      "appStore.sidebarCollapsed ? '64px' : '232px'",
      'class="header-context"',
      'class="system-status"',
      'currentModuleTitle',
      'currentRoleLabel',
      'cloudStatusText',
      'isSupabaseConfigured',
      '@media (max-width: 960px)',
      '@media (max-width: 768px)',
    ], 'layout shell')
  })

  it('normalizes common Element Plus surfaces and dense business cards', () => {
    assertIncludesAll(visualCss, [
      '.page-container .el-table.el-table',
      '.page-container .el-button',
      '.page-container .el-tag.el-tag',
      '.page-container .kpi-card.kpi-card',
      '.page-container .sales-metric-card.sales-metric-card',
      '.page-container .ui-metric-card.ui-metric-card',
      '@media (max-width: 768px)',
    ], 'visual-system.css')
    assert.doesNotMatch(visualCss, /summary-card|summary-row|summary-value|summary-label|summary-meta/)
  })

  it('keeps shared display components available for page migration', () => {
    assertIncludesAll(displayNumberSource, [
      'class="ui-number"',
      'formatMoney(numericValue.value)',
      "props.prefix ?? '¥'",
      'resolvedPrecision',
      'font-variant-numeric: tabular-nums',
      'toFixed(resolvedPrecision.value)',
    ], 'DisplayNumber')
    assertIncludesAll(metricCardSource, [
      'class="ui-metric-card"',
      'DisplayNumber',
      'import type { Component } from \'vue\'',
      'icon?: string | Component',
      ':prefix="prefix"',
      'displayPrecision',
      "tone: 'neutral'",
    ], 'MetricCard')
    assertIncludesAll(metricStripSource, [
      'export type MetricStripItem',
      'prefix?: string',
      'icon?: string | Component',
      'grid-template-columns: repeat(auto-fit, minmax(176px, 1fr))',
      "testid: 'metric-strip'",
    ], 'MetricStrip')
    assertIncludesAll(statusTagSource, [
      'class="ui-status-tag"',
      'effect="plain"',
    ], 'StatusTag')
  })

  it('moves shared base components onto the visual tokens', () => {
    assertIncludesAll(pageHeaderSource, [
      'subtitle?: string',
      'class="page-heading"',
      'class="page-subtitle"',
      'var(--ui-font-size-page-title)',
      'var(--ui-icon-button)',
      'var(--ui-color-primary)',
    ], 'PageHeader')
    assertIncludesAll(salesMetricStripSource, [
      'var(--ui-font-size-number)',
      'var(--ui-radius-card)',
      'border-left-color: var(--ui-color-success)',
    ], 'SalesMetricStrip')
    assertIncludesAll(baseCrudTableSource, [
      'StatusTag',
      'RowActions',
      'v-bind="resolveTag(column, row[column.prop])"',
      'resolvedActionWidth',
      'var(--ui-radius-control)',
      'var(--ui-color-border-soft)',
    ], 'BaseCrudTable')
    assertIncludesAll(baseCrudFormSource, [
      'var(--ui-color-primary)',
      'var(--ui-font-size-body)',
      'var(--ui-color-text-secondary)',
    ], 'BaseCrudForm')
    assertIncludesAll(searchBarSource, [
      'title?: string',
      'description?: string',
      'keywordPlaceholder?: string',
      'class="search-bar-head"',
      'class="search-actions"',
      '@media (max-width: 768px)',
      'width: 100% !important',
    ], 'SearchBar')
    assertIncludesAll(masterCrudPageSource, [
      ':subtitle="subtitle"',
      'subtitle?: string',
    ], 'MasterCrudPage')
  })

  it('adds business subtitles and denser filters to frequent operation pages', () => {
    assertIncludesAll(baseDataSchemaSource, [
      'subtitle: string',
      '维护客户档案、联系人、账期和信用等级',
      '维护供应商资质、联系人、账期和风险状态',
      '维护产品编码、规格、类型、单价和图片资料',
      '维护设备状态、吨位、位置和点检属性',
      '维护仓库、库位和启用状态',
    ], 'base data schema')
    assertIncludesAll(baseCustomerSource, [
      ':subtitle="config.subtitle"',
      'title="筛选客户"',
      'description="按客户关键字、状态和信用等级快速定位往来单位。"',
    ], 'customer page')
    assertIncludesAll(baseSupplierSource, [
      ':subtitle="config.subtitle"',
      'title="筛选供应商"',
    ], 'supplier page')
    assertIncludesAll(baseProductSource, [
      ':subtitle="config.subtitle"',
      'title="筛选产品"',
    ], 'product page')
    assertIncludesAll(saleOrdersSource, [
      'subtitle="统一管理客户订单、交期、审核、发货进度和回款状态。"',
      'title="筛选销售订单"',
      'keyword-placeholder="订单编号、客户、产品"',
    ], 'sale orders page')
    assertIncludesAll(saleDeliveriesSource, [
      'subtitle="跟踪销售出库后的发货单、物流状态、签收进度和导出留档。"',
      'title="筛选发货记录"',
      'keyword-placeholder="发货单、销售订单、运单号"',
    ], 'sale deliveries page')
    assertIncludesAll(stockQuerySource, [
      'subtitle="按仓库、供应商、产品和批次风险查询当前库存、可用量和库存金额。"',
      'title="筛选库存"',
      'keyword-placeholder="产品、批次、库位"',
    ], 'stock query page')
    assertIncludesAll(purchaseOrdersSource, [
      'subtitle="串联缺料建议、请购、转采购、到货入库、批次成本和风险跟踪。"',
      'class="card-title"',
      '按风险优先级展示待处理采购事项',
    ], 'purchase orders page')
    assertIncludesAll(workbenchTodosSource, [
      'subtitle="集中处理工作台、预警、现场异常和流程任务，保留认领、分派、处理和关闭记录。"',
      'class="card-title"',
      '按紧急程度和流程状态快速收敛待处理事项',
    ], 'workbench todos page')
  })

  it('migrates high-impact metric sections to the shared MetricStrip', () => {
    const migratedSources = [
      ['MasterCrudPage', masterCrudPageSource, 'master-metric-strip'],
      ['finance dashboard', financeDashboardSource, 'finance-dashboard-metrics'],
      ['boss dashboard', bossDashboardSource, 'boss-dashboard-metrics'],
      ['production board', productionBoardSource, 'production-board-metrics'],
      ['quality board', qualityBoardSource, 'quality-board-metrics'],
    ]

    for (const [label, source, testid] of migratedSources) {
      assertIncludesAll(source, ['MetricStrip', testid], label)
      assert.doesNotMatch(source, /cardValueText|cardIcon/)
      assert.doesNotMatch(source, /class="kpi-card"/)
      assert.doesNotMatch(source, /\.kpi-card__value/)
    }
  })

  it('migrates the remaining KPI-heavy pages to the shared MetricStrip', () => {
    const migratedSources = [
      ['home dashboard', dashboardSource, 'home-kpi-strip'],
      ['injection module', injectionModuleSource, 'injection-module-metrics'],
      ['equipment spare parts', equipmentSparePartsSource, 'spare-parts-metrics'],
      ['process inspection', processInspectionSource, 'process-inspection-metrics'],
      ['defect disposal', defectDisposalSource, 'defect-disposal-metrics'],
      ['purchase orders', purchaseOrdersSource, 'purchase-order-metrics'],
      ['productization', productizationSource, 'productization-metrics'],
      ['salary daily', salaryDailySource, 'salary-daily-audit'],
      ['salary adjust', salaryAdjustSource, 'salary-adjust-audit'],
      ['salary monthly', salaryMonthlySource, 'salary-monthly-audit'],
      ['workbench todos', workbenchTodosSource, 'workbench-todo-metrics'],
      ['finance statements', financeStatementsSource, 'finance-statements-metrics'],
      ['notification center', notificationCenterSource, 'notification-center-metrics'],
      ['cloud ops backup', cloudOpsSource, 'cloud-ops-metrics'],
    ]

    for (const [label, source, testid] of migratedSources) {
      assertIncludesAll(source, ['MetricStrip', testid], label)
      assert.doesNotMatch(source, /class="kpi-card"/)
      assert.doesNotMatch(source, /\.kpi-card__value/)
      assert.doesNotMatch(source, /summary-card|summary-row|summary-value|summary-label|summary-meta/)
      assert.doesNotMatch(source, /ops-summary-item|ops-summary-label/)
    }
  })

  it('standardizes table row actions behind a compact shared dropdown', () => {
    assertIncludesAll(rowActionsSource, [
      'export type RowActionItem',
      'maxVisible',
      'visible !== false',
      'el-dropdown',
      'overflowActions',
      "command: [key: string]",
      'white-space: nowrap',
    ], 'RowActions')

    assertIncludesAll(baseCrudTableSource, [
      '<RowActions',
      ':actions="resolveRowActions(row)"',
      ':max-visible="2"',
      '@command="$emit(\'row-action\', $event, row)"',
      'Math.min(Number(props.config.actionWidth || 150), 170)',
    ], 'BaseCrudTable row actions')

    const migratedSources = [
      ['sale orders', saleOrdersSource, 'saleOrderRowActions', 'width="160"'],
      ['sale deliveries', saleDeliveriesSource, 'deliveryRowActions', 'width="140"'],
      ['sale payments', salePaymentsSource, 'paymentRowActions', 'width="150"'],
      ['purchase orders', purchaseOrdersSource, 'purchaseOrderRowActions', 'width="170"'],
      ['workbench todos', workbenchTodosSource, 'todoRowActions', 'width="170"'],
    ]

    for (const [label, source, actionFactory, widthToken] of migratedSources) {
      assertIncludesAll(source, ['RowActions', actionFactory, widthToken], label)
      assert.doesNotMatch(source, /label="操作"[^>]+width="(?:2[0-9][0-9]|3[0-9][0-9])"/)
    }
  })

  it('is included in the root test script', () => {
    assert.match(packageSource, /tests\/visual-system\.test\.mjs/)
  })
})
