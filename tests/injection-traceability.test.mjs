import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  INJECTION_MODULES,
  buildBatchTraceLinks,
  buildLabelPayload,
  buildPurchaseRequisitionSuggestion,
  isEightDComplete,
  summarizeComplaint8d,
} from '../frontend-admin/src/utils/injection-professional.ts'

const root = process.cwd()
const readText = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

describe('注塑追溯、标签、8D 与请购闭环', () => {
  it('批次追溯链可串联采购、生产、质检、入库和出库节点', () => {
    const links = buildBatchTraceLinks({
      traceNo: 'BT-20260704',
      prodOrderId: 9,
      batchId: 18,
      events: [
        { sourceType: 'PURCHASE_INBOUND', sourceId: 1, targetType: 'MATERIAL_PICKING', targetId: 2 },
        { sourceType: 'MATERIAL_PICKING', sourceId: 2, targetType: 'PRODUCTION_REPORT', targetId: 3 },
        { sourceType: 'PRODUCTION_REPORT', sourceId: 3, targetType: 'QC_RECORD', targetId: 4 },
        { sourceType: 'QC_RECORD', sourceId: 4, targetType: 'FINISH_INBOUND', targetId: 5 },
        { sourceType: 'FINISH_INBOUND', sourceId: 5, targetType: 'SALE_SHIPMENT', targetId: 6 },
      ],
    })

    assert.equal(links.length, 5)
    assert.equal(links[0].traceNo, 'BT-20260704-1')
    assert.equal(links.at(-1).targetType, 'SALE_SHIPMENT')
    assert.equal(links.every((item) => item.prodOrderId === 9 && item.batchId === 18), true)
  })

  it('标签默认模板包含产品、批次、客户、数量和日期占位', () => {
    const payload = buildLabelPayload({ name: '客户箱标', targetType: 'CUSTOMER' })
    assert.equal(payload.name, '客户箱标')
    assert.equal(payload.targetType, 'CUSTOMER')
    for (const token of ['{{productCode}}', '{{productName}}', '{{batchNo}}', '{{customerName}}', '{{qty}}', '{{date}}']) {
      assert.equal(payload.templateContent.includes(token), true)
    }
  })

  it('8D 改善完整度必须覆盖 D1-D8 后才能关闭', () => {
    const partial = summarizeComplaint8d({ d1Team: '质量部', d2Problem: '箱标混批', d4RootCause: '换线未清场' })
    assert.equal(partial.completed, 3)
    assert.equal(partial.complete, false)

    const complete = {
      d1Team: '质量部',
      d2Problem: '箱标混批',
      d3Containment: '隔离库存',
      d4RootCause: '换线未清场',
      d5CorrectiveAction: '增加清场确认',
      d6Implementation: '班组执行',
      d7Prevention: '纳入点检',
      d8Closure: '客户确认',
    }
    assert.equal(isEightDComplete(complete), true)
  })

  it('MRP 缺料可生成请购建议并保留来源单号', () => {
    const suggestion = buildPurchaseRequisitionSuggestion({
      materialId: 3,
      shortageQty: 12.2,
      safetyStock: 5,
      sourceMrpNo: 'MRP-001',
    })

    assert.equal(suggestion.materialId, 3)
    assert.equal(suggestion.shortageQty, 12.2)
    assert.equal(suggestion.requestedQty, 18)
    assert.equal(suggestion.sourceMrpNo, 'MRP-001')
    assert.equal(suggestion.status, 'DRAFT')
  })

  it('数据库、API 适配器和管理端路由覆盖全部 13 个注塑资源', async () => {
    const [initSql, cloudSql, adminAdapter, mobileAdapter, adminRoutes] = await Promise.all([
      readText('database/init.sql'),
      readText('database/supabase-cloud.sql'),
      readText('frontend-admin/src/api/supabaseRequest.ts'),
      readText('frontend-mobile/src/api/supabaseRequest.ts'),
      readText('frontend-admin/src/router/route-config.ts'),
    ])

    for (const module of INJECTION_MODULES) {
      assert.match(initSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${module.table}`, 'i'))
      assert.match(cloudSql, new RegExp(`create table if not exists public\\.${module.table}`, 'i'))
      assert.equal(adminAdapter.includes(`${module.table}: [`), true)
      assert.equal(mobileAdapter.includes(`${module.table}: [`), true)
      assert.equal(adminRoutes.includes(`/injection`) && adminRoutes.includes(module.key), true)
    }

    assert.equal(adminAdapter.includes('...INJECTION_MODULES.map((item) => ({'), true)
    assert.equal(adminAdapter.includes('resource: item.resource'), true)
    assert.equal(mobileAdapter.includes('...INJECTION_MODULES.map((item) => ({'), true)
    assert.equal(mobileAdapter.includes('resource: item.resource'), true)

    assert.match(initSql, /CREATE TABLE IF NOT EXISTS spare_part/i)
    assert.match(cloudSql, /create table if not exists public\.spare_part/i)
  })

  it('管理端注塑入口按业务归属挂入现有菜单栏', async () => {
    const adminRoutes = await readText('frontend-admin/src/router/route-config.ts')

    assert.match(adminRoutes, /title: '生产管理'[\s\S]*injectionRoutes\.processCard[\s\S]*injectionRoutes\.processChange/)
    assert.match(adminRoutes, /title: '现场执行'[\s\S]*injectionRoutes\.startupCheck[\s\S]*injectionRoutes\.trialMold[\s\S]*injectionRoutes\.materialMix[\s\S]*injectionRoutes\.labelTemplate[\s\S]*injectionRoutes\.andonEvent/)
    assert.match(adminRoutes, /title: '设备模具'[\s\S]*injectionRoutes\.maintenanceOrder[\s\S]*injectionRoutes\.moldMaintenancePlan/)
    assert.match(adminRoutes, /title: '质量追溯'[\s\S]*injectionRoutes\.batchTrace[\s\S]*injectionRoutes\.customerComplaint/)
    assert.match(adminRoutes, /title: '采购管理'[\s\S]*injectionRoutes\.purchaseRequisition/)
    assert.match(adminRoutes, /title: '报表中心'[\s\S]*injectionRoutes\.oeeRecord/)
    assert.equal(adminRoutes.includes('const unmatchedInjectionRoutes: AppLeafRoute[] = []'), true)
    assert.equal(adminRoutes.includes("if (childPath.startsWith('/')) return childPath"), true)
  })
})
