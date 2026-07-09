import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

const sources = {
  routeConfig: read('frontend-admin/src/router/route-config.ts'),
  moldApi: read('frontend-admin/src/api/mold.ts'),
  supabaseRequest: read('frontend-admin/src/api/supabaseRequest.ts'),
  machineInspection: read('frontend-admin/src/views/prod/machine-inspection-records.vue'),
  downtime: read('frontend-admin/src/views/prod/downtime.vue'),
  mountRecords: read('frontend-admin/src/views/prod/mount-records.vue'),
  moldMaintenance: read('frontend-admin/src/views/prod/mold-maintenance-records.vue'),
  spareParts: read('frontend-admin/src/views/equipment/spare-parts.vue'),
  injectionModule: read('frontend-admin/src/views/injection/module.vue'),
}

function assertIncludes(source, marker, label) {
  assert.equal(source.includes(marker), true, `${label} missing marker: ${marker}`)
}

function assertAll(label, source, markers) {
  for (const marker of markers) assertIncludes(source, marker, label)
}

describe('equipment and mold delivery target', () => {
  it('keeps the equipment menu focused on the P0 child pages', () => {
    assertAll('equipment route config', sources.routeConfig, [
      "path: '/equipment'",
      "title: '设备模具'",
      "'/prod/machine-inspection-records'",
      "view: 'prod/machine-inspection-records.vue'",
      'injectionRoutes.maintenanceOrder',
      "path: '/equipment/spare-parts'",
      "view: 'equipment/spare-parts.vue'",
      "'/prod/downtime'",
      "view: 'prod/downtime.vue'",
      "'/prod/mount-records'",
      "view: 'prod/mount-records.vue'",
      "'/prod/mold-maintenance-records'",
      "view: 'prod/mold-maintenance-records.vue'",
      'injectionRoutes.moldMaintenancePlan',
    ])
  })

  it('keeps traditional equipment record pages visible, guarded and recoverable', () => {
    for (const [label, source] of [
      ['machine inspection', sources.machineInspection],
      ['downtime', sources.downtime],
      ['mount records', sources.mountRecords],
      ['mold maintenance records', sources.moldMaintenance],
    ]) {
      assertAll(label, source, [
        'errorMessage',
        'page-alert',
        'failureText',
        'ElMessage.error',
        ':loading="submitting"',
      ])
    }

    assertAll('machine inspection rules', sources.machineInspection, [
      '设备点检记录加载失败',
      '设备点检记录创建失败',
      '异常点检必须填写异常描述',
    ])
    assertAll('downtime rules', sources.downtime, [
      '停机记录加载失败',
      '停机记录创建失败',
      '停机记录删除失败',
      '停机结束时间不能早于开始时间',
    ])
    assertAll('mount record rules', sources.mountRecords, [
      '上下模记录加载失败',
      '上下模记录创建失败',
    ])
  })

  it('keeps mold maintenance as a closed-loop operation instead of a detached record', () => {
    assertAll('mold maintenance page', sources.moldMaintenance, [
      '新增保养',
      'selectedMoldText',
      '当前累计模次',
      'maintainMold(Number(form.moldId)',
      'operatorId: form.operatorId',
      'operateTime: form.operateTime',
      '模具保养提交失败',
    ])
    assertAll('mold maintenance api', sources.moldApi, [
      'maintainMold = (id: number, data?: any)',
      'request.post(`/molds/${id}/maintenance`, data)',
    ])
    assertAll('supabase mold maintenance transaction', sources.supabaseRequest, [
      'async function maintainMoldData(id: number, input: any = {})',
      'operatorId',
      'operateTime',
      'mold_maintenance_record',
      'shots_since_maintenance: 0',
      'maintenance_count: toNumber(mold.maintenanceCount) + 1',
      "remark: String(input?.remark || '').trim()",
    ])
  })

  it('keeps spare parts and injection module failures actionable', () => {
    assertAll('spare parts page', sources.spareParts, [
      '低于安全库存',
      '补货待办',
      'createReplenishTodo',
      "runInjectionAction(RESOURCE, Number(row.id), 'replenish')",
      '备件库存加载失败',
      '备件保存失败',
      '备件删除失败',
      'errorMessage',
      'page-alert',
      ':loading="submitting"',
    ])
    assertAll('injection module page', sources.injectionModule, [
      'errorMessage',
      'page-alert',
      'ElMessage.error',
      ':loading="submitting"',
      '加载失败',
      '保存失败',
      '删除失败',
      '流转权限',
    ])
  })
})
