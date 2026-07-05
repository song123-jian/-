import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  INJECTION_MODULES,
  buildInjectionRecordPayload,
  getInjectionModuleByKey,
  validateInjectionRecord,
} from '../frontend-mobile/src/utils/injection-professional.ts'
import { buildMobileTodoItems, summarizeMobileTodos } from '../frontend-mobile/src/utils/mobile-todo.ts'

const root = process.cwd()
const readText = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

describe('移动端注塑专业入口', () => {
  it('移动端复用 13 个注塑模块定义与现场必填校验', () => {
    assert.equal(INJECTION_MODULES.length, 13)
    const module = getInjectionModuleByKey('startup-check')
    assert.equal(module.shortTitle, '齐套检查')
    assert.equal(validateInjectionRecord('startup-check', { prodOrderId: 1 }), '')
  })

  it('移动端可构造首件确认与模具保养载荷', () => {
    const trial = buildInjectionRecordPayload('trial-mold', {
      prodOrderId: 7,
      processCardId: 3,
      firstArticleResult: 'OK',
      status: 'WAIT_CONFIRM',
    }, new Date('2026-07-04T09:00:00'))
    assert.equal(trial.trialNo, 'TM-20260704-090000')
    assert.equal(trial.status, 'WAIT_CONFIRM')

    const plan = buildInjectionRecordPayload('mold-maintenance-plan', {
      moldId: 2,
      maintenanceCycle: 10000,
      shotsSinceMaintenance: 9000,
      lifetime: 100000,
      usedShots: 60000,
    }, new Date('2026-07-04T09:10:00'))
    assert.equal(plan.planNo, 'MP-20260704-091000')
    assert.equal(plan.riskLevel, 'warning')
    assert.equal(plan.status, 'WARNING')
  })

  it('移动端待办中心合并注塑待办并保持高优先级', () => {
    const items = buildMobileTodoItems({
      injectionTasks: [
        { id: 1, moduleKey: 'andon-event', title: '首件驳回处理', moduleTitle: '安灯异常', description: '待分派', route: '/m/injection/andon-event' },
      ],
      reportTasks: [
        { id: 9, productName: '外壳', workOrderNo: 'WO-009', machineCode: 'IM-001' },
      ],
    })

    assert.deepEqual(items.map((item) => item.type), ['report', 'injection'])
    assert.equal(items[1].route, '/m/injection/andon-event')
    assert.deepEqual(summarizeMobileTodos(items), { total: 2, report: 1, qc: 0, inventory: 0, transfer: 0, offline: 0, injection: 1 })
  })

  it('移动端路由、首页入口和待办页均接入注塑专业', async () => {
    const [router, home, todo, mobileApi] = await Promise.all([
      readText('frontend-mobile/src/router/index.ts'),
      readText('frontend-mobile/src/views/home/index.vue'),
      readText('frontend-mobile/src/views/todo/index.vue'),
      readText('frontend-mobile/src/api/supabaseRequest.ts'),
    ])

    assert.equal(router.includes('/m/injection/:moduleKey?'), true)
    assert.equal(home.includes("goTo('/m/injection')"), true)
    assert.equal(todo.includes('getInjectionMobileTasks'), true)
    assert.equal(mobileApi.includes("path === 'injection/mobile-tasks'"), true)
  })
})
