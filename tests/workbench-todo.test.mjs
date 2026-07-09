import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { buildRoutePath, routeGroups } from '../frontend-admin/src/router/route-config.ts'
import { canAccessRoles } from '../frontend-admin/src/utils/role-access.ts'
import {
  applyWorkbenchTodoAction,
  buildWorkbenchTodoItems,
  createWorkbenchTodoLifecycleState,
  getWorkbenchTodoLifecycleStatusText,
  getWorkbenchTodoSourceText,
  getWorkbenchTodoStatusText,
  isWorkbenchTodoOverdue,
  mergeWorkbenchTodoLifecycle,
  summarizeWorkbenchTodos,
} from '../frontend-admin/src/utils/workbench-todo.ts'
import {
  getWorkflowBusinessTitle,
  getWorkflowDefinition,
  getWorkflowTaskPriorityStatus,
  getWorkflowTransition,
  resolveWorkflowBusinessType,
} from '../frontend-admin/src/utils/workflow-center.ts'

describe('管理端统一待办模型', () => {
  it('聚合预警、安灯、生产、质检、盘点和调拨来源并按优先级排序', () => {
    const rows = buildWorkbenchTodoItems({
      today: '2026-07-05',
      warnings: [
        { id: 'stock-low-1', level: 'ERROR', category: '库存', targetName: '外壳', message: '低于安全库存' },
      ],
      andonEvents: [
        { id: 8, eventNo: 'AN-8', title: '机台报警', description: 'A01 异常', status: 'OPEN', createdAt: '2026-07-05 08:00:00' },
      ],
      productionOrders: [
        { id: 2, orderNo: 'MO-2', status: 'PAUSED', planEnd: '2026-07-06', createdAt: '2026-07-04' },
        { id: 3, orderNo: 'MO-3', status: 'RUNNING', planEnd: '2026-07-04', createdAt: '2026-07-03' },
      ],
      qcRecords: [
        { id: 4, checkResult: 'FAIL', defectType: '缩水', defectDesc: '首件不合格', checkTime: '2026-07-05 09:00:00' },
      ],
      inventoryDocs: [
        { id: 5, inventoryNo: 'PD-5', status: 'PENDING_APPROVE', createdAt: '2026-07-05 10:00:00' },
      ],
      transferDocs: [
        { id: 6, transferNo: 'TR-6', status: 'SHIPPED', createdAt: '2026-07-05 11:00:00' },
      ],
    })

    assert.equal(rows.length, 7)
    assert.deepEqual(rows.slice(0, 4).map((item) => item.source), ['andon', 'warning', 'production', 'production'])
    assert.equal(new Set(rows.map((item) => item.source)).size >= 6, true)
    assert.equal(rows.every((item) => item.id && item.title && item.description && item.route && item.priority), true)
    assert.equal(rows.every((item) => ['URGENT', 'PROCESSING', 'PENDING'].includes(item.status)), true)
    assert.deepEqual(summarizeWorkbenchTodos(rows), {
      total: 7,
      urgent: 5,
      processing: 0,
      actionable: 7,
      sources: {
        andon: 1,
        warning: 1,
        production: 2,
        qc: 1,
        inventory: 1,
        transfer: 1,
      },
    })
  })

  it('兼容历史工作台待办字段并输出可读标签', () => {
    const [row] = buildWorkbenchTodoItems({
      dashboardTodos: [
        { type: '工作台', content: '请处理日报', time: '2026-07-05 12:00:00', status: '紧急', path: '/dashboard' },
      ],
    })

    assert.equal(row.source, 'dashboard')
    assert.equal(row.description, '请处理日报')
    assert.equal(row.status, 'URGENT')
    assert.equal(getWorkbenchTodoSourceText(row.source), '工作台')
    assert.equal(getWorkbenchTodoStatusText(row.status), '紧急')
  })

  it('保留首页已聚合待办的真实来源，避免待办中心全部降级为工作台来源', () => {
    const rows = buildWorkbenchTodoItems({
      dashboardTodos: [
        {
          id: 'warning-stock-low',
          source: 'warning',
          type: '库存',
          title: '外壳低库存',
          description: '低于安全库存',
          priority: 20,
          status: 'URGENT',
          route: '/prod/warnings',
          relatedId: 'stock-low',
          createdAt: '2026-07-05 08:00:00',
        },
      ],
    })

    assert.equal(rows[0].source, 'warning')
    assert.equal(rows[0].id, 'warning-stock-low')
    assert.equal(rows[0].route, '/prod/warnings')
  })

  it('聚合统一流程任务并保留业务入口和负责人', () => {
    const [row] = buildWorkbenchTodoItems({
      workflowTasks: [
        {
          id: 101,
          businessType: 'sale_order',
          businessId: 9,
          businessCode: 'XS-009',
          title: '销售订单审核：XS-009',
          description: '销售订单待审核',
          status: 'OPEN',
          priority: 25,
          assigneeName: '销售经理',
          sourceRoute: '/sale/orders',
          dueAt: '2026-07-06 23:59:59',
          createdAt: '2026-07-05 10:00:00',
        },
      ],
    })

    assert.equal(row.source, 'workflow')
    assert.equal(row.type, '销售订单审核')
    assert.equal(row.status, 'URGENT')
    assert.equal(row.owner, '销售经理')
    assert.equal(row.route, '/sale/orders')
    assert.equal(row.relatedId, 101)
  })

  it('支持认领、分派、开始处理、关闭、超时提醒和处理记录', () => {
    const [todo] = buildWorkbenchTodoItems({
      dashboardTodos: [
        {
          id: 'todo-1',
          source: 'dashboard',
          type: '工作台',
          title: '处理日报',
          description: '日报待确认',
          priority: 50,
          status: 'PENDING',
          dueAt: '2026-07-04',
          route: '/dashboard',
        },
      ],
    })

    let state = createWorkbenchTodoLifecycleState(todo, '2026-07-05T08:00:00.000Z')
    state = applyWorkbenchTodoAction(state, { type: 'claim', actor: '张三', at: '2026-07-05T08:05:00.000Z' })
    state = applyWorkbenchTodoAction(state, { type: 'assign', actor: '张三', owner: '李四', at: '2026-07-05T08:10:00.000Z' })
    state = applyWorkbenchTodoAction(state, { type: 'start', actor: '李四', at: '2026-07-05T08:20:00.000Z' })

    const overdue = mergeWorkbenchTodoLifecycle(todo, state, '2026-07-05T09:00:00.000Z')
    assert.equal(isWorkbenchTodoOverdue(todo, '2026-07-05T09:00:00.000Z'), true)
    assert.equal(overdue.lifecycleStatus, 'OVERDUE')
    assert.equal(overdue.lifecycleStatusText, '已超时')
    assert.equal(overdue.owner, '李四')
    assert.deepEqual(overdue.history.map((item) => item.action), ['claim', 'assign', 'start'])
    assert.deepEqual(summarizeWorkbenchTodos([overdue]), {
      total: 1,
      urgent: 1,
      processing: 0,
      actionable: 1,
      sources: { dashboard: 1 },
    })

    state = applyWorkbenchTodoAction(state, { type: 'close', actor: '李四', at: '2026-07-05T09:10:00.000Z' })
    const closed = mergeWorkbenchTodoLifecycle(todo, state, '2026-07-06T09:00:00.000Z')
    assert.equal(closed.lifecycleStatus, 'CLOSED')
    assert.equal(closed.isOverdue, false)
    assert.equal(getWorkbenchTodoLifecycleStatusText(closed.lifecycleStatus), '已关闭')
    assert.deepEqual(closed.history.map((item) => item.action), ['claim', 'assign', 'start', 'close'])
    assert.deepEqual(summarizeWorkbenchTodos([closed]), {
      total: 1,
      urgent: 0,
      processing: 0,
      actionable: 0,
      sources: { dashboard: 1 },
    })
  })
})

describe('仪表盘角色准入', () => {
  it('老板驾驶舱仅管理角色可访问，生产和质量看板允许现场角色', () => {
    const reportGroup = routeGroups.find((group) => group.path === '/report')
    const boss = reportGroup?.children.find((item) => item.name === 'BossDashboard')
    const production = reportGroup?.children.find((item) => item.name === 'ProductionBoard')
    const quality = reportGroup?.children.find((item) => item.name === 'QualityBoard')

    assert.deepEqual(boss?.roles, ['admin', 'boss'])
    assert.equal(canAccessRoles(['operator'], boss?.roles), false)
    assert.equal(canAccessRoles(['boss'], boss?.roles), true)
    assert.equal(canAccessRoles(['operator'], production?.roles), true)
    assert.equal(canAccessRoles(['operator'], quality?.roles), true)
  })

  it('生产闭环核心页面和预警入口均允许现场角色访问', () => {
    const leafRoutes = routeGroups.flatMap((group) => group.children.map((item) => ({
      ...item,
      fullPath: buildRoutePath(group.path, item.path),
    })))
    const requiredRoutes = [
      { path: '/prod/orders', title: '生产订单', view: 'prod/orders.vue' },
      { path: '/prod/reports', title: '扫码报工', view: 'prod/reports.vue' },
      { path: '/stock/out-picking', title: '生产领料', view: 'stock/out-picking.vue' },
      { path: '/stock/in-produce', title: '成品入库', view: 'stock/in-produce.vue' },
      { path: '/report/production-board', title: '生产看板', view: 'report/production-board.vue' },
      { path: '/prod/warnings', title: '预警中心', view: 'prod/warnings.vue' },
    ]

    for (const route of requiredRoutes) {
      const matched = leafRoutes.find((item) => item.fullPath === route.path)
      assert.equal(matched?.title, route.title)
      assert.equal(matched?.view, route.view)
      assert.equal(canAccessRoles(['operator'], matched?.roles), true)
      assert.equal(existsSync(`frontend-admin/src/views/${route.view}`), true)
    }
  })
})

describe('管理端工作台仪表盘交付目标', () => {
  it('首页保留 7 类核心指标并提供清晰的未连接状态', () => {
    const dashboard = readFileSync('frontend-admin/src/views/dashboard/index.vue', 'utf8')
    for (const label of ['今日产出', '工单完成率', 'OEE', '停机分钟', '预警数', '待处理工单', '未读消息']) {
      assert.equal(dashboard.includes(`label: '${label}'`), true)
    }
    assert.equal(dashboard.includes('MetricStrip'), true)
    assert.equal(dashboard.includes('home-kpi-strip'), true)
    assert.equal(dashboard.includes('Supabase 云数据库未连接'), true)
    assert.equal(dashboard.includes('避免把全量 0 值误判为真实业务数据'), true)
    assert.equal(dashboard.includes('部分工作台数据加载失败'), true)
  })

  it('管理端首页后端接入真实待办源而不是空数组占位', () => {
    const adapter = readFileSync('frontend-admin/src/api/supabaseRequest.ts', 'utf8')
    const dashboardHome = adapter.slice(adapter.indexOf('async function dashboardHome()'), adapter.indexOf('async function productionBoard'))

    assert.equal(dashboardHome.includes('buildWorkbenchTodoItems'), true)
    assert.equal(dashboardHome.includes('Promise.allSettled'), true)
    assert.equal(dashboardHome.includes('todoList: []'), false)
    for (const source of ['warnings:', 'andonEvents:', 'productionOrders:', 'qcRecords:', 'inventoryDocs:', 'transferDocs:', 'workflowTasks:']) {
      assert.equal(dashboardHome.includes(source), true)
    }
  })

  it('管理端待办中心提供生命周期动作、超时提示和处理记录', () => {
    const todos = readFileSync('frontend-admin/src/views/workbench/todos.vue', 'utf8')

    for (const marker of ['认领', '分派', '开始处理', '关闭', '超时', '处理记录']) {
      assert.equal(todos.includes(marker), true)
    }
    for (const marker of ['mergeWorkbenchTodoLifecycle', 'applyWorkbenchTodoAction', 'workbench-todo-lifecycle-states']) {
      assert.equal(todos.includes(marker), true)
    }
  })
})

describe('统一流程中心', () => {
  it('识别首批业务对象并生成可读标题', () => {
    assert.equal(resolveWorkflowBusinessType('customer'), 'customer')
    assert.equal(resolveWorkflowBusinessType('sale-orders'), 'sale_order')
    assert.equal(resolveWorkflowBusinessType('purchase_requisition'), 'purchase_requisition')
    assert.equal(resolveWorkflowBusinessType('prod_order'), 'prod_order')
    assert.equal(resolveWorkflowBusinessType('maintenance-orders'), 'maintenance_order')
    assert.equal(resolveWorkflowBusinessType('spare-parts'), 'spare_part')
    assert.equal(resolveWorkflowBusinessType('salary_monthly'), 'salary_month')
    assert.equal(resolveWorkflowBusinessType('qc-records'), 'qc_record')
    assert.equal(resolveWorkflowBusinessType('stock-inventories'), 'stock_inventory')
    assert.equal(resolveWorkflowBusinessType('expense-records'), 'expense_record')
    assert.equal(resolveWorkflowBusinessType('payment-records'), 'payment_record')
    assert.equal(resolveWorkflowBusinessType('stock-in-purchase'), 'purchase_inbound')
    assert.equal(getWorkflowDefinition('prod_order')?.route, '/prod/orders')
    assert.equal(getWorkflowDefinition('spare_part')?.route, '/equipment/spare-parts')
    assert.equal(getWorkflowDefinition('salary_month')?.route, '/salary/monthly')
    assert.equal(getWorkflowDefinition('qc_record')?.route, '/qc/defect-disposal')
    assert.equal(getWorkflowDefinition('stock_inventory')?.route, '/stock/inventory')
    assert.equal(getWorkflowDefinition('expense_record')?.route, '/finance/expenses')
    assert.equal(getWorkflowDefinition('payment_record')?.route, '/sale/payments')
    assert.equal(getWorkflowDefinition('purchase_inbound')?.route, '/stock/in-purchase')
    assert.equal(
      getWorkflowBusinessTitle('sale_order', { orderNo: 'XS-001', customerName: '华东客户' }),
      '销售订单审核 - XS-001 - 华东客户',
    )
    assert.equal(
      getWorkflowBusinessTitle('spare_part', { code: 'SP-001', name: '油封' }),
      '备件补货闭环 - SP-001 - 油封',
    )
    assert.equal(
      getWorkflowBusinessTitle('stock_inventory', { inventoryNo: 'PD-001', warehouseName: '成品仓' }),
      '库存盘点审批 - PD-001 - 成品仓',
    )
    assert.equal(
      getWorkflowBusinessTitle('expense_record', { expenseNo: 'FY-001', payee: '房东' }),
      '费用支出审批 - FY-001 - 房东',
    )
    assert.equal(
      getWorkflowBusinessTitle('payment_record', { paymentNo: 'HK-001', customerName: '华南客户' }),
      '销售回款确认 - HK-001 - 华南客户',
    )
    assert.equal(
      getWorkflowBusinessTitle('purchase_inbound', { moveNo: 'RK-001', supplierName: '华东供应商' }),
      '采购入库复核 - RK-001 - 华东供应商',
    )
  })

  it('覆盖审核、驳回、生产派工到完工的核心流转', () => {
    const saleCreate = getWorkflowTransition('sale_order', 'create')
    assert.equal(saleCreate?.instanceStatus, 'APPROVING')
    assert.equal(saleCreate?.nextTask?.node, 'review')

    const saleApprove = getWorkflowTransition('sale_order', 'approve')
    assert.equal(saleApprove?.instanceStatus, 'APPROVED')
    assert.equal(saleApprove?.closeOpenTasks, true)
    assert.equal(saleApprove?.nextTask, undefined)

    const rejected = getWorkflowTransition('purchase_requisition', 'reject')
    assert.equal(rejected?.instanceStatus, 'REJECTED')
    assert.equal(rejected?.nextTask?.node, 'rework')

    const dispatch = getWorkflowTransition('prod_order', 'dispatch')
    assert.equal(dispatch?.currentNode, 'start')
    assert.equal(dispatch?.nextTask?.title, '生产工单开工')

    const pause = getWorkflowTransition('prod_order', 'pause')
    assert.equal(pause?.nextTask?.priority, 20)
    assert.equal(getWorkflowTaskPriorityStatus({ priority: 20, status: 'OPEN' }), 'URGENT')

    const finish = getWorkflowTransition('prod_order', 'finish')
    assert.equal(finish?.instanceStatus, 'COMPLETED')
    assert.equal(finish?.nextTask, undefined)
  })

  it('覆盖设备维修和备件补货二期流程', () => {
    const repairCreate = getWorkflowTransition('maintenance_order', 'create', { orderNo: 'WX-001', priority: 'CRITICAL' })
    assert.equal(repairCreate?.currentNode, 'assign')
    assert.equal(repairCreate?.nextTask?.title, '设备维修派工')
    assert.equal(repairCreate?.nextTask?.priority, 15)

    const repairAssign = getWorkflowTransition('maintenance_order', 'assign', { priority: 'WARNING' })
    assert.equal(repairAssign?.currentNode, 'start')
    assert.equal(repairAssign?.nextTask?.title, '设备维修开工')

    const repairFinish = getWorkflowTransition('maintenance_order', 'finish')
    assert.equal(repairFinish?.currentNode, 'acceptance')
    assert.equal(repairFinish?.nextTask?.title, '设备维修验收关闭')

    const normalSparePart = getWorkflowTransition('spare_part', 'replenish', { code: 'SP-OK', qty: 20, safeStock: 5, status: 'ACTIVE' })
    assert.equal(normalSparePart, null)

    const lowSparePart = getWorkflowTransition('spare_part', 'replenish', { code: 'SP-LOW', qty: 2, safeStock: 5, status: 'ACTIVE' })
    assert.equal(lowSparePart?.currentNode, 'replenish')
    assert.equal(lowSparePart?.nextTask?.title, '备件补货处理')
    assert.equal(lowSparePart?.nextTask?.priority, 25)
  })

  it('覆盖工资月结、质量处置和库存盘点三期流程', () => {
    const salarySettle = getWorkflowTransition('salary_month', 'settle', { month: '2026-07', workerCountText: '12人' })
    assert.equal(salarySettle?.instanceStatus, 'APPROVING')
    assert.equal(salarySettle?.nextTask?.title, '工资月结复核')

    const passQc = getWorkflowTransition('qc_record', 'create', { id: 1, checkResult: 'PASS', disposalStatus: 'CLOSED' })
    assert.equal(passQc, null)

    const failQc = getWorkflowTransition('qc_record', 'create', { id: 2, checkResult: 'FAIL', disposalStatus: 'OPEN' })
    assert.equal(failQc?.currentNode, 'assign')
    assert.equal(failQc?.nextTask?.title, '不良品处置分派')

    const qcAssign = getWorkflowTransition('qc_record', 'assign')
    assert.equal(qcAssign?.currentNode, 'start')
    assert.equal(qcAssign?.nextTask?.title, '不良品处置开始处理')

    const inventoryCreate = getWorkflowTransition('stock_inventory', 'create')
    assert.equal(inventoryCreate?.currentNode, 'start')
    assert.equal(inventoryCreate?.nextTask?.title, '库存盘点执行')

    const inventorySubmit = getWorkflowTransition('stock_inventory', 'submit')
    assert.equal(inventorySubmit?.instanceStatus, 'APPROVING')
    assert.equal(inventorySubmit?.nextTask?.title, '库存盘点审批')

    const inventoryApprove = getWorkflowTransition('stock_inventory', 'approve')
    assert.equal(inventoryApprove?.instanceStatus, 'COMPLETED')
    assert.equal(inventoryApprove?.nextTask, undefined)
  })

  it('覆盖费用审批、销售回款确认和采购入库复核流程', () => {
    const expenseCreate = getWorkflowTransition('expense_record', 'create', { expenseNo: 'FY-001', payee: '房东' })
    assert.equal(expenseCreate?.instanceStatus, 'APPROVING')
    assert.equal(expenseCreate?.currentNode, 'approval')
    assert.equal(expenseCreate?.nextTask?.title, '费用支出审批')
    assert.equal(expenseCreate?.nextTask?.priority, 35)

    const paymentCreate = getWorkflowTransition('payment_record', 'create', { paymentNo: 'HK-001', customerName: '华南客户' })
    assert.equal(paymentCreate?.instanceStatus, 'APPROVING')
    assert.equal(paymentCreate?.currentNode, 'confirm')
    assert.equal(paymentCreate?.nextTask?.title, '销售回款确认')
    assert.equal(paymentCreate?.nextTask?.priority, 30)

    const paymentConfirm = getWorkflowTransition('payment_record', 'confirm')
    assert.equal(paymentConfirm?.instanceStatus, 'APPROVED')
    assert.equal(paymentConfirm?.closeOpenTasks, true)

    const inboundCreate = getWorkflowTransition('purchase_inbound', 'create', { moveNo: 'RK-001', supplierName: '华东供应商' })
    assert.equal(inboundCreate?.instanceStatus, 'APPROVING')
    assert.equal(inboundCreate?.currentNode, 'review')
    assert.equal(inboundCreate?.nextTask?.title, '采购入库复核')
    assert.equal(inboundCreate?.nextTask?.priority, 25)

    const inboundReject = getWorkflowTransition('purchase_inbound', 'reject')
    assert.equal(inboundReject?.instanceStatus, 'REJECTED')
    assert.equal(inboundReject?.nextTask?.node, 'rework')
  })
})
