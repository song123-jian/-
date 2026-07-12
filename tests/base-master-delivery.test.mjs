import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import {
  MASTER_REFERENCE_RULES,
  buildMasterReferenceMessage,
  getMasterReferenceRules,
  resolveMasterResource,
} from '../frontend-admin/src/utils/master-reference.ts'

const schemaSource = fs.readFileSync(new URL('../frontend-admin/src/views/base/base-data-schema.ts', import.meta.url), 'utf8')
const routeSource = fs.readFileSync(new URL('../frontend-admin/src/router/route-config.ts', import.meta.url), 'utf8')
const tableSource = fs.readFileSync(new URL('../frontend-admin/src/components/BaseCrudTable.vue', import.meta.url), 'utf8')
const formSource = fs.readFileSync(new URL('../frontend-admin/src/components/BaseCrudForm.vue', import.meta.url), 'utf8')
const apiSource = fs.readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')

const configNames = {
  products: 'productPageConfig',
  customers: 'customerPageConfig',
  suppliers: 'supplierPageConfig',
  machines: 'machinePageConfig',
  molds: 'moldPageConfig',
  users: 'userPageConfig',
  warehouses: 'warehousePageConfig',
}

function findMatchingBrace(source, openIndex) {
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function configBlock(configName) {
  const marker = `export const ${configName}`
  const markerIndex = schemaSource.indexOf(marker)
  assert.notEqual(markerIndex, -1, `${configName} not found`)
  const equalsIndex = schemaSource.indexOf('= {', markerIndex)
  assert.notEqual(equalsIndex, -1, `${configName} object start not found`)
  const openIndex = schemaSource.indexOf('{', equalsIndex)
  const closeIndex = findMatchingBrace(schemaSource, openIndex)
  assert.notEqual(closeIndex, -1, `${configName} object end not found`)
  return schemaSource.slice(openIndex, closeIndex + 1)
}

function assertIncludesAll(source, values, context) {
  for (const value of values) {
    assert.ok(source.includes(value), `${context} missing ${value}`)
  }
}

describe('base master delivery target', () => {
  it('keeps business master data under base and moves user administration to system management', () => {
    const baseStart = routeSource.indexOf("path: '/base'")
    const baseEnd = routeSource.indexOf("path: '/sale'", baseStart)
    const baseBlock = routeSource.slice(baseStart, baseEnd)
    assertIncludesAll(baseBlock, [
      'baseRoutes.products',
      'baseRoutes.customers',
      'baseRoutes.suppliers',
      'baseRoutes.warehouses',
      'baseRoutes.machines',
      'baseRoutes.molds',
    ], 'base route group')
    assert.equal(baseBlock.includes('systemRoutes.users'), false)

    const systemStart = routeSource.indexOf("path: '/system'")
    const systemBlock = routeSource.slice(systemStart)
    assert.equal(systemBlock.includes('systemRoutes.users'), true)

    for (const name of ['Users', 'Warehouses', 'Products', 'Customers', 'Suppliers', 'Machines', 'Molds']) {
      const matches = routeSource.match(new RegExp(`name: '${name}'`, 'g')) || []
      assert.equal(matches.length, 1, `${name} should be registered once`)
    }
  })

  it('keeps the unified CRUD page standard for every master data page', () => {
    for (const [resource, name] of Object.entries(configNames)) {
      const block = configBlock(name)
      assertIncludesAll(block, [
        "key: 'inspect'",
        "key: 'edit'",
        "key: 'delete'",
        'searchFields:',
        'tableColumns:',
        'detailItems:',
        'formRows:',
        'metrics:',
        'emptyText:',
        'emptyDetailText:',
        "kind: 'tag'",
      ], `${resource} config`)
      assert.match(block, /toolbarActions:[\s\S]*toolbar\.add[\s\S]*toolbar\.refresh/, `${resource} missing add/refresh`)
    }
  })

  it('keeps import, export, batch status, and log entry for product, machine and mold pages', () => {
    for (const resource of ['products', 'machines', 'molds']) {
      const block = configBlock(configNames[resource])
      assertIncludesAll(block, ['toolbar.import', 'toolbar.export', 'toolbar.logs', 'toolbar.batchEnable'], `${resource} toolbar`)
      assert.match(block, /toolbar\.batch(Disable|Stop)/, `${resource} missing batch disable/stop`)
    }
  })

  it('shows target quality metrics beyond total count', () => {
    const expectedMetricLabels = {
      products: ['图片完整', '工艺参数', '原料规则', '安全库存', '数据风险'],
      customers: ['联系人', '税票信息', '账期', '销售归属', '数据风险'],
      suppliers: ['联系人', '电话', '主营材料', '数据风险'],
      machines: ['运行状态', '保养状态', '寿命参数', '异常风险'],
      molds: ['运行状态', '保养状态', '寿命参数', '异常风险'],
      warehouses: ['启用状态', '基础完整性'],
      users: ['启用状态', '角色/权限', '基础完整性'],
    }
    for (const [resource, labels] of Object.entries(expectedMetricLabels)) {
      const block = configBlock(configNames[resource])
      assertIncludesAll(block, labels.map((label) => `label: '${label}'`), `${resource} metrics`)
      assert.match(block, /label: '[^']*(?!总数)[^']*'/, `${resource} only exposes total metrics`)
    }
  })

  it('keeps table and form experience requirements in shared components and schema', () => {
    assertIncludesAll(tableSource, [':fixed="column.fixed"', ':align="column.align"', 'show-overflow-tooltip', 'v-loading="loading"', 'el-pagination'], 'BaseCrudTable')
    assertIncludesAll(formSource, ['基础信息', '业务参数', '状态/备注', 'resolvedFormRules', 'form-section__title'], 'BaseCrudForm')

    for (const [resource, name] of Object.entries(configNames)) {
      const block = configBlock(name)
      assert.match(block, /fixed: 'left'/, `${resource} missing fixed key columns`)
      assert.match(block, /width:|minWidth:/, `${resource} missing stable width`)
      assert.match(block, /kind: 'tag'/, `${resource} missing tag status`)
    }

    for (const resource of ['products', 'customers', 'machines', 'molds']) {
      assert.match(configBlock(configNames[resource]), /align: 'right'/, `${resource} missing right aligned numeric columns`)
    }
  })
})

describe('master reference guard rules', () => {
  it('maps all seven resources and aliases to reference rules', () => {
    for (const resource of Object.keys(configNames)) {
      assert.equal(resolveMasterResource(resource), resource)
      assert.ok(getMasterReferenceRules(resource).length > 0, `${resource} missing reference rules`)
    }
    assert.equal(resolveMasterResource('product'), 'products')
    assert.equal(resolveMasterResource('sys_user'), 'users')
  })

  it('covers the required business domains before deletion', () => {
    const expectedDomains = {
      products: ['生产', '库存', '销售', '工资'],
      customers: ['销售', '发货', '回款'],
      suppliers: ['采购', '批次'],
      machines: ['排产', '报工', 'OEE', '保养'],
      molds: ['排产', '报工', '保养'],
      warehouses: ['库存'],
      users: ['销售', '生产', '工资'],
    }
    for (const [resource, domains] of Object.entries(expectedDomains)) {
      const actual = new Set(MASTER_REFERENCE_RULES[resource].map((item) => item.domain))
      for (const domain of domains) {
        assert.ok(actual.has(domain), `${resource} missing ${domain} reference domain`)
      }
    }
  })

  it('builds a Chinese blocking message for referenced master data', () => {
    const message = buildMasterReferenceMessage('products', [
      { table: 'prod_order', column: 'product_id', label: '生产订单', domain: '生产', count: 2 },
      { table: 'stock', column: 'product_id', label: '库存余额', domain: '库存', count: 1 },
    ])
    assert.match(message, /产品已被生产、库存引用/)
    assert.match(message, /不能删除/)
    assert.match(message, /请先停用/)
  })

  it('wires generic Supabase delete through the master reference guard', () => {
    assert.match(apiSource, /async function assertMasterDataNotReferenced/)
    assert.match(apiSource, /await assertMasterDataNotReferenced\(route, id\)[\s\S]*?\.delete\(\)\.eq\('id', id\)/)
  })
})
