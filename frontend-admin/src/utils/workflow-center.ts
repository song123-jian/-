export type WorkflowBusinessType =
  | 'customer'
  | 'sale_order'
  | 'purchase_requisition'
  | 'prod_order'
  | 'maintenance_order'
  | 'spare_part'
  | 'salary_month'
  | 'qc_record'
  | 'stock_inventory'
  | 'expense_record'
  | 'payment_record'
  | 'purchase_inbound'

export type WorkflowAction =
  | 'create'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'dispatch'
  | 'start'
  | 'pause'
  | 'resume'
  | 'finish'
  | 'cancel'
  | 'close'
  | 'generate'
  | 'replenish'
  | 'settle'

export type WorkflowInstanceStatus =
  | 'DRAFT'
  | 'APPROVING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CLOSED'

export type WorkflowTaskStatus = 'OPEN' | 'CLAIMED' | 'ASSIGNED' | 'PROCESSING' | 'DONE' | 'CANCELLED'

export type WorkflowDefinition = {
  code: string
  name: string
  businessType: WorkflowBusinessType
  route: string
  codeFields: string[]
  nameFields: string[]
}

export type WorkflowTaskPlan = {
  node: string
  title: string
  description: string
  priority: number
  dueDays?: number
}

export type WorkflowTransition = {
  instanceStatus: WorkflowInstanceStatus
  currentNode: string
  closeOpenTasks: boolean
  nextTask?: WorkflowTaskPlan
}

export type WorkflowTaskRow = {
  id?: string | number
  businessType?: string
  businessId?: string | number
  businessCode?: string
  title?: string
  description?: string
  status?: string
  priority?: number
  assigneeId?: string | number
  assigneeName?: string
  sourceRoute?: string
  dueAt?: string
  createdAt?: string
}

export const workflowDefinitions: Record<WorkflowBusinessType, WorkflowDefinition> = {
  customer: {
    code: 'customer-master-review',
    name: '客户资料审核',
    businessType: 'customer',
    route: '/base/customers',
    codeFields: ['code'],
    nameFields: ['shortName', 'name'],
  },
  sale_order: {
    code: 'sale-order-approval',
    name: '销售订单审核',
    businessType: 'sale_order',
    route: '/sale/orders',
    codeFields: ['orderNo', 'order_no'],
    nameFields: ['customerName', 'remark'],
  },
  purchase_requisition: {
    code: 'purchase-requisition-approval',
    name: '采购请购审批',
    businessType: 'purchase_requisition',
    route: '/injection/purchase-requisition',
    codeFields: ['requisitionNo', 'requisition_no'],
    nameFields: ['sourceMrpNo', 'source_mrp_no', 'remark'],
  },
  prod_order: {
    code: 'production-order-flow',
    name: '生产工单闭环',
    businessType: 'prod_order',
    route: '/prod/orders',
    codeFields: ['orderNo', 'order_no'],
    nameFields: ['productName', 'remark'],
  },
  maintenance_order: {
    code: 'maintenance-order-repair-flow',
    name: '设备维修闭环',
    businessType: 'maintenance_order',
    route: '/injection/maintenance-order',
    codeFields: ['orderNo', 'order_no'],
    nameFields: ['faultType', 'fault_type', 'remark'],
  },
  spare_part: {
    code: 'spare-part-replenishment',
    name: '备件补货闭环',
    businessType: 'spare_part',
    route: '/equipment/spare-parts',
    codeFields: ['code'],
    nameFields: ['name', 'spec'],
  },
  salary_month: {
    code: 'salary-month-review',
    name: '工资月结复核',
    businessType: 'salary_month',
    route: '/salary/monthly',
    codeFields: ['month'],
    nameFields: ['workerCountText', 'remark'],
  },
  qc_record: {
    code: 'qc-defect-disposal-flow',
    name: '不良品处置闭环',
    businessType: 'qc_record',
    route: '/qc/defect-disposal',
    codeFields: ['recordNo', 'record_no', 'id'],
    nameFields: ['defectType', 'defect_type', 'defectDesc', 'defect_desc'],
  },
  stock_inventory: {
    code: 'stock-inventory-approval',
    name: '库存盘点审批',
    businessType: 'stock_inventory',
    route: '/stock/inventory',
    codeFields: ['inventoryNo', 'inventory_no'],
    nameFields: ['warehouseName', 'remark'],
  },
  expense_record: {
    code: 'expense-approval-flow',
    name: '费用支出审批',
    businessType: 'expense_record',
    route: '/finance/expenses',
    codeFields: ['expenseNo', 'expense_no'],
    nameFields: ['payee', 'expenseTypeText', 'expense_type', 'remark'],
  },
  payment_record: {
    code: 'payment-confirmation-flow',
    name: '销售回款确认',
    businessType: 'payment_record',
    route: '/sale/payments',
    codeFields: ['paymentNo', 'payment_no'],
    nameFields: ['customerName', 'orderNo', 'invoiceNo', 'remark'],
  },
  purchase_inbound: {
    code: 'purchase-inbound-review',
    name: '采购入库复核',
    businessType: 'purchase_inbound',
    route: '/stock/in-purchase',
    codeFields: ['moveNo', 'move_no'],
    nameFields: ['supplierName', 'productName', 'warehouseName', 'batchNo', 'remark'],
  },
}

export function getWorkflowDefinition(businessType?: string | null) {
  return workflowDefinitions[String(businessType || '') as WorkflowBusinessType]
}

export function resolveWorkflowBusinessType(tableOrResource?: string | null): WorkflowBusinessType | '' {
  const value = String(tableOrResource || '').replace(/-/g, '_')
  if (value === 'customer' || value === 'customers') return 'customer'
  if (value === 'sale_order' || value === 'sale_orders') return 'sale_order'
  if (value === 'purchase_requisition' || value === 'purchase_requisitions') return 'purchase_requisition'
  if (value === 'prod_order' || value === 'prod_orders') return 'prod_order'
  if (value === 'maintenance_order' || value === 'maintenance_orders') return 'maintenance_order'
  if (value === 'spare_part' || value === 'spare_parts') return 'spare_part'
  if (value === 'salary_month' || value === 'salary_months' || value === 'salary_monthly') return 'salary_month'
  if (value === 'qc_record' || value === 'qc_records') return 'qc_record'
  if (value === 'stock_inventory' || value === 'stock_inventories') return 'stock_inventory'
  if (value === 'expense_record' || value === 'expense_records') return 'expense_record'
  if (value === 'payment_record' || value === 'payment_records') return 'payment_record'
  if (value === 'purchase_inbound' || value === 'purchase_inbounds' || value === 'stock_in_purchase') return 'purchase_inbound'
  return ''
}

export function normalizeWorkflowAction(action?: string | null): WorkflowAction {
  const value = String(action || 'create').trim().toLowerCase()
  if (value === 'confirm') return 'approve'
  if (value === 'receive') return 'finish'
  if (value === 'ship') return 'finish'
  if (value === 'restock') return 'replenish'
  if (value === 'settled') return 'settle'
  return ([
    'create',
    'submit',
    'approve',
    'reject',
    'assign',
    'dispatch',
    'start',
    'pause',
    'resume',
    'finish',
    'cancel',
    'close',
    'generate',
    'replenish',
    'settle',
  ].includes(value) ? value : 'create') as WorkflowAction
}

function readFirst(row: Record<string, any>, fields: string[]) {
  for (const field of fields) {
    const value = row?.[field]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function getWorkflowBusinessCode(businessType: WorkflowBusinessType, row: Record<string, any> = {}) {
  const definition = workflowDefinitions[businessType]
  return readFirst(row, definition.codeFields) || `#${row.id || row.businessId || ''}`.trim()
}

export function getWorkflowBusinessName(businessType: WorkflowBusinessType, row: Record<string, any> = {}) {
  const definition = workflowDefinitions[businessType]
  return readFirst(row, definition.nameFields)
}

export function getWorkflowBusinessTitle(businessType: WorkflowBusinessType, row: Record<string, any> = {}) {
  const code = getWorkflowBusinessCode(businessType, row)
  const name = getWorkflowBusinessName(businessType, row)
  return [workflowDefinitions[businessType].name, code, name].filter(Boolean).join(' - ')
}

function reviewTask(businessType: WorkflowBusinessType): WorkflowTaskPlan {
  const definition = workflowDefinitions[businessType]
  return {
    node: 'review',
    title: definition.name,
    description: `${definition.name}待处理，请完成资料复核、审批或驳回。`,
    priority: businessType === 'sale_order' || businessType === 'purchase_requisition' ? 45 : 55,
    dueDays: 1,
  }
}

function rejectedTask(businessType: WorkflowBusinessType): WorkflowTaskPlan {
  const definition = workflowDefinitions[businessType]
  return {
    node: 'rework',
    title: `${definition.name}驳回修改`,
    description: '流程已驳回，需要补充资料后重新提交。',
    priority: 30,
  }
}

function maintenancePriority(row: Record<string, any> = {}) {
  const value = String(row.priority || '').toUpperCase()
  if (value === 'CRITICAL') return 15
  if (value === 'WARNING') return 25
  return 40
}

export function isSparePartReplenishmentNeeded(row: Record<string, any> = {}) {
  const status = String(row.status || '').toUpperCase()
  const qty = Number(row.qty ?? row.quantity ?? 0)
  const safeStock = Number(row.safeStock ?? row.safe_stock ?? 0)
  return status !== 'INACTIVE' && safeStock > 0 && qty <= safeStock
}

function isQcDisposalNeeded(row: Record<string, any> = {}) {
  const result = String(row.checkResult ?? row.check_result ?? '').toUpperCase()
  const disposalStatus = String(row.disposalStatus ?? row.disposal_status ?? '').toUpperCase()
  return ['FAIL', 'FAILED', 'NG', '不合格'].includes(result) && disposalStatus !== 'CLOSED'
}

export function getWorkflowTransition(
  businessType: WorkflowBusinessType,
  actionInput?: string | null,
  businessRow: Record<string, any> = {},
): WorkflowTransition | null {
  const action = normalizeWorkflowAction(actionInput)

  if (businessType === 'stock_inventory' && action === 'submit') {
    return {
      instanceStatus: 'APPROVING',
      currentNode: 'review',
      closeOpenTasks: true,
      nextTask: {
        node: 'review',
        title: '库存盘点审批',
        description: '盘点单已提交，请复核差异原因，审批后将调整库存。',
        priority: 25,
        dueDays: 1,
      },
    }
  }

  if (action === 'create' || action === 'submit' || action === 'replenish' || action === 'settle') {
    if (businessType === 'prod_order') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'dispatch',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'dispatch',
          title: '生产工单派工',
          description: '新工单待排产派工，请确认机台、模具和计划时间。',
          priority: 50,
          dueDays: 1,
        },
      }
    }
    if (businessType === 'maintenance_order') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'assign',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'assign',
          title: '设备维修派工',
          description: '维修单已上报，请确认维修负责人、优先级和预计处理时间。',
          priority: maintenancePriority(businessRow),
          dueDays: 1,
        },
      }
    }
    if (businessType === 'spare_part') {
      if (!isSparePartReplenishmentNeeded(businessRow)) return null
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'replenish',
        closeOpenTasks: false,
        nextTask: {
          node: 'replenish',
          title: '备件补货处理',
          description: '备件库存已低于安全库存，请确认采购、调拨或替代件方案。',
          priority: 25,
          dueDays: 2,
        },
      }
    }
    if (businessType === 'salary_month') {
      return {
        instanceStatus: 'APPROVING',
        currentNode: 'review',
        closeOpenTasks: true,
        nextTask: {
          node: 'review',
          title: '工资月结复核',
          description: '月度工资已结算，请复核员工数、应发合计、日工资和奖惩锁定结果。',
          priority: 35,
          dueDays: 1,
        },
      }
    }
    if (businessType === 'qc_record') {
      if (!isQcDisposalNeeded(businessRow)) return null
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'assign',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'assign',
          title: '不良品处置分派',
          description: '不合格质检记录待处置，请确认责任人、处置方案和关闭标准。',
          priority: 30,
          dueDays: 1,
        },
      }
    }
    if (businessType === 'stock_inventory') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'start',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'start',
          title: '库存盘点执行',
          description: '盘点单已创建，请开始盘点并录入实盘数量。',
          priority: 55,
          dueDays: 2,
        },
      }
    }
    if (businessType === 'expense_record') {
      return {
        instanceStatus: 'APPROVING',
        currentNode: 'approval',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'approval',
          title: '费用支出审批',
          description: '费用支出已登记，请复核付款对象、费用类型、金额和备注，审批通过后关闭待办。',
          priority: 35,
          dueDays: 1,
        },
      }
    }
    if (businessType === 'payment_record') {
      return {
        instanceStatus: 'APPROVING',
        currentNode: 'confirm',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'confirm',
          title: '销售回款确认',
          description: '销售回款已登记，请核对客户、订单、金额、日期和发票信息并确认到账。',
          priority: 30,
          dueDays: 1,
        },
      }
    }
    if (businessType === 'purchase_inbound') {
      return {
        instanceStatus: 'APPROVING',
        currentNode: 'review',
        closeOpenTasks: action !== 'create',
        nextTask: {
          node: 'review',
          title: '采购入库复核',
          description: '采购入库已完成，请复核供应商、物料、批次、数量、单价和有效期。',
          priority: 25,
          dueDays: 1,
        },
      }
    }
    return {
      instanceStatus: 'APPROVING',
      currentNode: 'review',
      closeOpenTasks: action !== 'create',
      nextTask: reviewTask(businessType),
    }
  }

  if (action === 'approve') {
    if (businessType === 'stock_inventory') {
      return { instanceStatus: 'COMPLETED', currentNode: 'completed', closeOpenTasks: true }
    }
    if (businessType === 'purchase_requisition') {
      return {
        instanceStatus: 'APPROVED',
        currentNode: 'convert',
        closeOpenTasks: true,
        nextTask: {
          node: 'convert',
          title: '采购请购转单',
          description: '请购已审批，请转换采购订单或关闭请购。',
          priority: 60,
          dueDays: 2,
        },
      }
    }
    return {
      instanceStatus: 'APPROVED',
      currentNode: 'approved',
      closeOpenTasks: true,
    }
  }

  if (action === 'reject') {
    return {
      instanceStatus: 'REJECTED',
      currentNode: 'rework',
      closeOpenTasks: true,
      nextTask: rejectedTask(businessType),
    }
  }

  if (businessType === 'prod_order') {
    if (action === 'dispatch') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'start',
        closeOpenTasks: true,
        nextTask: {
          node: 'start',
          title: '生产工单开工',
          description: '工单已派工，请现场确认后开工。',
          priority: 45,
          dueDays: 1,
        },
      }
    }
    if (action === 'start' || action === 'resume') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'execution',
        closeOpenTasks: true,
        nextTask: {
          node: 'execution',
          title: '生产执行跟进',
          description: '工单生产中，请跟进报工、领料、质量和入库闭环。',
          priority: 65,
        },
      }
    }
    if (action === 'pause') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'resume',
        closeOpenTasks: true,
        nextTask: {
          node: 'resume',
          title: '暂停工单恢复处理',
          description: '工单已暂停，需要确认恢复生产、调整计划或取消。',
          priority: 20,
        },
      }
    }
  }

  if (businessType === 'maintenance_order') {
    if (action === 'assign' || action === 'dispatch') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'start',
        closeOpenTasks: true,
        nextTask: {
          node: 'start',
          title: '设备维修开工',
          description: '维修单已分派，请维修人员到场确认并开始处理。',
          priority: maintenancePriority(businessRow),
          dueDays: 1,
        },
      }
    }
    if (action === 'start' || action === 'resume') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'repair',
        closeOpenTasks: true,
        nextTask: {
          node: 'repair',
          title: '设备维修处理跟进',
          description: '设备维修处理中，请跟进故障原因、备件消耗和恢复时间。',
          priority: maintenancePriority(businessRow),
        },
      }
    }
    if (action === 'finish') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'acceptance',
        closeOpenTasks: true,
        nextTask: {
          node: 'acceptance',
          title: '设备维修验收关闭',
          description: '维修已完成，请完成验收、记录备件费用并关闭维修单。',
          priority: 35,
          dueDays: 1,
        },
      }
    }
  }

  if (businessType === 'qc_record') {
    if (action === 'assign' || action === 'dispatch') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'start',
        closeOpenTasks: true,
        nextTask: {
          node: 'start',
          title: '不良品处置开始处理',
          description: '不良品处置已分派，请启动隔离、返工、报废或让步接收处理。',
          priority: 30,
          dueDays: 1,
        },
      }
    }
    if (action === 'start' || action === 'resume') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'processing',
        closeOpenTasks: true,
        nextTask: {
          node: 'processing',
          title: '不良品处置跟进',
          description: '不良品处置处理中，请补充处置结果、责任归属和预防措施。',
          priority: 45,
        },
      }
    }
  }

  if (businessType === 'stock_inventory') {
    if (action === 'start') {
      return {
        instanceStatus: 'PROCESSING',
        currentNode: 'count',
        closeOpenTasks: true,
        nextTask: {
          node: 'count',
          title: '库存盘点录入实盘',
          description: '盘点已开始，请录入实盘数量并填写差异原因。',
          priority: 50,
          dueDays: 2,
        },
      }
    }
  }

  if (action === 'finish' || action === 'generate') {
    return { instanceStatus: 'COMPLETED', currentNode: 'completed', closeOpenTasks: true }
  }
  if (action === 'cancel') {
    return { instanceStatus: 'CANCELLED', currentNode: 'cancelled', closeOpenTasks: true }
  }
  if (action === 'close') {
    return { instanceStatus: 'CLOSED', currentNode: 'closed', closeOpenTasks: true }
  }

  return null
}

export function getWorkflowTaskStatusText(status?: string | null) {
  const labels: Record<WorkflowTaskStatus, string> = {
    OPEN: '待处理',
    CLAIMED: '已认领',
    ASSIGNED: '已分派',
    PROCESSING: '处理中',
    DONE: '已完成',
    CANCELLED: '已取消',
  }
  return labels[String(status || '').toUpperCase() as WorkflowTaskStatus] || String(status || '待处理')
}

export function getWorkflowTaskPriorityStatus(row: Pick<WorkflowTaskRow, 'priority' | 'status'>) {
  const status = String(row.status || '').toUpperCase()
  if (status === 'PROCESSING' || status === 'CLAIMED' || status === 'ASSIGNED') return 'PROCESSING'
  if (Number(row.priority || 99) <= 30) return 'URGENT'
  return 'PENDING'
}
