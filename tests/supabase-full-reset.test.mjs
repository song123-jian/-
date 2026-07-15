import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { TextDecoder } from 'node:util'
import {
  assertSupabaseConfigPassword,
  verifySupabaseConfigPassword,
} from '../frontend-admin/src/utils/supabase-config-security.ts'
import { getErrorMessage } from '../frontend-admin/src/utils/error-message.ts'
import {
  assertSupabaseConnectionCanBeStored,
  isSafeSupabasePublishableKey,
  normalizeSupabaseProjectUrl,
  resolveSupabaseAuthEmailDomain,
  resolveSupabaseConnectionConfig,
} from '../frontend-admin/src/utils/supabase-runtime-config.ts'

const initUrl = new URL('../database/init.sql', import.meta.url)
const cloudUrl = new URL('../database/supabase-cloud.sql', import.meta.url)
const loginResetUrl = new URL('../database/supabase-login-reset.sql', import.meta.url)
const adminRequestUrl = new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url)
const mobileRequestUrl = new URL('../frontend-mobile/src/api/supabaseRequest.ts', import.meta.url)
const adminSupabaseClientUrl = new URL('../frontend-admin/src/api/supabaseClient.ts', import.meta.url)
const mobileSupabaseClientUrl = new URL('../frontend-mobile/src/api/supabaseClient.ts', import.meta.url)
const adminAuthSessionUrl = new URL('../frontend-admin/src/utils/auth-session.ts', import.meta.url)
const mobileAuthSessionUrl = new URL('../frontend-mobile/src/utils/auth-session.ts', import.meta.url)
const adminAuthStorageUrl = new URL('../frontend-admin/src/utils/auth-storage.ts', import.meta.url)
const adminRouterUrl = new URL('../frontend-admin/src/router/index.ts', import.meta.url)
const mobileRouterUrl = new URL('../frontend-mobile/src/router/index.ts', import.meta.url)
const adminApiIndexUrl = new URL('../frontend-admin/src/api/index.ts', import.meta.url)
const mobileApiIndexUrl = new URL('../frontend-mobile/src/api/index.ts', import.meta.url)
const supabaseConfigSecurityUrl = new URL('../frontend-admin/src/utils/supabase-config-security.ts', import.meta.url)
const loginPageUrl = new URL('../frontend-admin/src/views/login/index.vue', import.meta.url)
const mobileLoginPageUrl = new URL('../frontend-mobile/src/views/login/index.vue', import.meta.url)
const cloudOpsUrl = new URL('../frontend-admin/src/utils/cloud-ops.ts', import.meta.url)
const dashboardUrl = new URL('../frontend-admin/src/views/dashboard/index.vue', import.meta.url)
const userAdminFunctionUrl = new URL('../supabase/functions/erp-user-admin/index.ts', import.meta.url)
const supabaseConfigUrl = new URL('../supabase/config.toml', import.meta.url)
const decoder = new TextDecoder('utf-8', { fatal: true })

const initBytes = readFileSync(initUrl)
const cloudBytes = readFileSync(cloudUrl)
const loginResetBytes = readFileSync(loginResetUrl)
const initSql = decoder.decode(initBytes)
const cloudSql = decoder.decode(cloudBytes)
const loginResetSql = decoder.decode(loginResetBytes)
const adminRequest = readFileSync(adminRequestUrl, 'utf8')
const mobileRequest = readFileSync(mobileRequestUrl, 'utf8')
const adminSupabaseClient = readFileSync(adminSupabaseClientUrl, 'utf8')
const mobileSupabaseClient = readFileSync(mobileSupabaseClientUrl, 'utf8')
const adminAuthSession = readFileSync(adminAuthSessionUrl, 'utf8')
const mobileAuthSession = readFileSync(mobileAuthSessionUrl, 'utf8')
const adminAuthStorage = readFileSync(adminAuthStorageUrl, 'utf8')
const adminRouter = readFileSync(adminRouterUrl, 'utf8')
const mobileRouter = readFileSync(mobileRouterUrl, 'utf8')
const adminApiIndex = readFileSync(adminApiIndexUrl, 'utf8')
const mobileApiIndex = readFileSync(mobileApiIndexUrl, 'utf8')
const supabaseConfigSecurity = readFileSync(supabaseConfigSecurityUrl, 'utf8')
const loginPage = readFileSync(loginPageUrl, 'utf8')
const mobileLoginPage = readFileSync(mobileLoginPageUrl, 'utf8')
const cloudOps = readFileSync(cloudOpsUrl, 'utf8')
const dashboard = readFileSync(dashboardUrl, 'utf8')
const userAdminFunction = readFileSync(userAdminFunctionUrl, 'utf8')
const supabaseConfig = readFileSync(supabaseConfigUrl, 'utf8')

const baseTables = [
  'sys_user',
  'machine',
  'mold',
  'product',
  'customer',
  'supplier',
  'sale_order',
  'sale_order_item',
  'prod_order',
  'prod_report',
  'downtime_record',
  'mold_mount_record',
  'mold_maintenance_record',
  'machine_inspection_record',
  'qc_record',
  'warehouse',
  'warehouse_location',
  'stock',
  'material_batch',
  'stock_move',
  'stock_transfer',
  'stock_transfer_item',
  'stock_inventory',
  'stock_inventory_item',
  'piece_price',
  'salary_daily',
  'salary_adjust',
  'payment_record',
  'delivery_order',
  'delivery_order_item',
  'expense_record',
  'sys_operation_log',
  'sys_config',
  'notification',
  'seq_number',
  'process_card',
  'trial_mold_record',
  'material_mix_order',
  'batch_trace_link',
  'startup_check',
  'maintenance_order',
  'spare_part',
  'mold_maintenance_plan',
  'andon_event',
  'label_template',
  'customer_complaint',
  'oee_record',
  'process_change',
  'purchase_requisition',
  'workflow_definition',
  'workflow_instance',
  'workflow_task',
  'workflow_log',
]

const moldTables = [
  'mold_development_project',
  'mold_project_milestone',
  'mold_trial_detail',
  'mold_revision',
  'mold_attachment',
  'mold_product',
  'mold_component',
  'mold_cost_record',
  'mold_supplier_evaluation',
]

const compatibilityColumns = [
  {
    table: 'sys_user',
    column: 'auth_user_id',
    definition: /^uuid(?:\s+unique)?$/i,
    dependents: [
      'create or replace function public.guard_sys_user_auth_binding',
      'create or replace trigger trg_guard_sys_user_auth_binding',
    ],
  },
  {
    table: 'trial_mold_record',
    column: 'project_id',
    definition: /^bigint$/i,
    dependents: [
      'do $trial_project_constraint$',
      'create index if not exists idx_trial_mold_record_project_status',
      'create or replace function public.release_mold_trial',
    ],
  },
  {
    table: 'trial_mold_record',
    column: 'trial_stage',
    definition: /^varchar\s*\(\s*32\s*\)$/i,
    dependents: ['create or replace function public.release_mold_trial'],
  },
  {
    table: 'trial_mold_record',
    column: 'shot_count',
    definition: /^(?:int|integer)\s+default\s+0$/i,
    dependents: ['create or replace function public.release_mold_trial'],
  },
  {
    table: 'trial_mold_record',
    column: 'cycle_seconds',
    definition: /^numeric\s*\(\s*12\s*,\s*2\s*\)$/i,
    dependents: ['create or replace function public.release_mold_trial'],
  },
  {
    table: 'trial_mold_record',
    column: 'defect_summary',
    definition: /^text$/i,
    dependents: ['create or replace function public.release_mold_trial'],
  },
  {
    table: 'trial_mold_record',
    column: 'correction_action',
    definition: /^text$/i,
    dependents: ['create or replace function public.release_mold_trial'],
  },
  {
    table: 'trial_mold_record',
    column: 'production_ready',
    definition: /^boolean\s+default\s+false$/i,
    dependents: ['create or replace function public.release_mold_trial'],
  },
]

const compatibilityColumnKeys = new Set(
  compatibilityColumns.map(({ table, column }) => `public.${table}.${column}`),
)

function hasUtf8Bom(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createdTables(source, cloud = false) {
  const pattern = cloud
    ? /^create table if not exists public\.([a-z0-9_]+)/gim
    : /^create table(?: if not exists)? ([a-z0-9_]+)/gim
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase())
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} contains duplicate names`)
}

function assertBefore(source, prerequisite, dependent) {
  const first = source.indexOf(prerequisite)
  const second = source.indexOf(dependent)
  assert.notEqual(first, -1, `missing dependency marker: ${prerequisite}`)
  assert.notEqual(second, -1, `missing dependent marker: ${dependent}`)
  assert.ok(first < second, `${prerequisite} must appear before ${dependent}`)
}

function adapterTableColumns(source) {
  const start = source.indexOf('const tableColumns')
  const end = source.indexOf('const filterOnlyKeys', start)
  assert.notEqual(start, -1, 'missing tableColumns map')
  assert.notEqual(end, -1, 'missing tableColumns map terminator')
  const block = source.slice(start, end)
  return [...block.matchAll(/^  ([a-z0-9_]+): \[([^\n]+)\],?$/gm)].map((match) => [
    match[1],
    [...match[2].matchAll(/'([a-z0-9_]+)'/g)].map((column) => column[1]),
  ])
}

function cloudObjectBody(table) {
  const tableMatch = cloudSql.match(
    new RegExp(`create table if not exists public\\.${escapeRegExp(table)} \\(([\\s\\S]*?)\\n\\);`, 'i'),
  )
  if (tableMatch) return tableMatch[1]
  if (table === 'mold_life_forecast') {
    return cloudSql.match(
      /create or replace view public\.mold_life_forecast[\s\S]*?\r?\nas\r?\n([\s\S]*?)where public\.can_access_mold_development\(\);/i,
    )?.[1]
  }
  return undefined
}

function extractFunction(source, name) {
  const marker = `create or replace function public.${name}`
  const start = source.toLowerCase().indexOf(marker)
  assert.notEqual(start, -1, `missing function ${name}`)
  const end = source.indexOf('\n$$;', start)
  assert.notEqual(end, -1, `function ${name} has no closing dollar quote`)
  return source.slice(start, end + 4)
}

function maskDollarQuoted(source) {
  let result = ''
  let index = 0
  while (index < source.length) {
    if (source[index] === "'" || source[index] === '"') {
      const quote = source[index]
      const start = index
      index += 1
      let closed = false
      while (index < source.length) {
        if (source[index] === quote && source[index + 1] === quote) {
          index += 2
          continue
        }
        if (source[index] === quote) {
          index += 1
          closed = true
          break
        }
        index += 1
      }
      assert.equal(closed, true, `unclosed SQL ${quote} quote`)
      result += source.slice(start, index).replace(/[^\n]/g, ' ')
      continue
    }
    const match = source.slice(index).match(/^\$[a-zA-Z_0-9]*\$/)
    if (!match) {
      result += source[index]
      index += 1
      continue
    }
    const tag = match[0]
    const end = source.indexOf(tag, index + tag.length)
    assert.notEqual(end, -1, `unclosed SQL dollar quote ${tag}`)
    result += ' '.repeat(end + tag.length - index)
    index = end + tag.length
  }
  return result
}

function topLevelAddedColumns(source) {
  const maskedSource = maskDollarQuoted(source)
  const alterTablePattern = /^\s*alter\s+table\s+(?:only\s+)?(?:([a-z_][a-z0-9_$]*)\.)?([a-z_][a-z0-9_$]*)\b[\s\S]*?;/gim
  const additionPattern = /\badd\s+column(\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_$]*)\s+([\s\S]*?)(?=,\s*add\s+column\b|;)/gim
  const additions = []

  for (const statement of maskedSource.matchAll(alterTablePattern)) {
    for (const addition of statement[0].matchAll(additionPattern)) {
      additions.push({
        schema: statement[1]?.toLowerCase(),
        table: statement[2].toLowerCase(),
        column: addition[2].toLowerCase(),
        definition: addition[3].trim().replace(/\s+/g, ' '),
        guarded: Boolean(addition[1]),
        index: statement.index + addition.index,
      })
    }
  }

  return additions
}

function assertLexicallyComplete(source, label) {
  const stack = []
  let index = 0
  let semicolons = 0
  let blockDepth = 0

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (blockDepth > 0) {
      if (char === '/' && next === '*') {
        blockDepth += 1
        index += 2
      } else if (char === '*' && next === '/') {
        blockDepth -= 1
        index += 2
      } else {
        index += 1
      }
      continue
    }

    if (char === '-' && next === '-') {
      const newline = source.indexOf('\n', index + 2)
      index = newline === -1 ? source.length : newline + 1
      continue
    }
    if (char === '/' && next === '*') {
      blockDepth = 1
      index += 2
      continue
    }
    if (char === "'" || char === '"') {
      const quote = char
      index += 1
      let closed = false
      while (index < source.length) {
        if (source[index] === quote && source[index + 1] === quote) {
          index += 2
          continue
        }
        if (source[index] === quote) {
          closed = true
          index += 1
          break
        }
        index += 1
      }
      assert.equal(closed, true, `${label} contains an unclosed ${quote} quote`)
      continue
    }
    if (char === '$') {
      const match = source.slice(index).match(/^\$[a-zA-Z_0-9]*\$/)
      if (match) {
        const tag = match[0]
        const end = source.indexOf(tag, index + tag.length)
        assert.notEqual(end, -1, `${label} contains an unclosed ${tag} quote`)
        index = end + tag.length
        continue
      }
    }
    if (char === '(' || char === '[') stack.push(char)
    if (char === ')' || char === ']') {
      const open = stack.pop()
      assert.equal(open, char === ')' ? '(' : '[', `${label} contains mismatched delimiters`)
    }
    if (char === ';') semicolons += 1
    index += 1
  }

  assert.equal(blockDepth, 0, `${label} contains an unclosed block comment`)
  assert.deepEqual(stack, [], `${label} contains unclosed delimiters`)
  assert.ok(semicolons >= 50, `${label} is unexpectedly short or missing statement terminators`)
}

describe('Supabase full reset SQL encoding and lexical completeness', () => {
  it('keeps both SQL files as valid UTF-8 without BOM or corruption markers', () => {
    assert.equal(hasUtf8Bom(initBytes), false)
    assert.equal(hasUtf8Bom(cloudBytes), false)
    for (const source of [initSql, cloudSql]) {
      assert.doesNotMatch(source, /\uFFFD|锟斤拷|Failed to fetch/i)
    }
    assert.match(initSql, /编码：UTF-8（无 BOM）/)
  })

  it('does not replace SQL files with SQL runner error output', () => {
    for (const [label, source] of [
      ['database/init.sql', initSql],
      ['database/supabase-cloud.sql', cloudSql],
    ]) {
      assert.doesNotMatch(
        source.trim(),
        /^(?:error\s*:|failed to run sql query\b)[\s\S]*$/i,
        `${label} was replaced with SQL runner error output`,
      )
    }
  })

  it('does not hard-code extension object schemas', () => {
    for (const source of [initSql, cloudSql]) {
      assert.doesNotMatch(source, /\bextensions\.(?:gin_trgm_ops|crypt|gen_random_bytes)\b/i)
    }
  })

  it('keeps quotes, comments, dollar bodies and delimiters complete', () => {
    assertLexicallyComplete(initSql, 'database/init.sql')
    assertLexicallyComplete(cloudSql, 'database/supabase-cloud.sql')
    assert.match(initSql.trim(), /COMMIT;$/i)
    assert.match(cloudSql.trim(), /commit;\s*-- END OF INJECT ERP SUPABASE BOOTSTRAP$/i)
  })
})

describe('fresh schema coverage and dependency order', () => {
  it('keeps init.sql as the complete base ERP, injection and workflow schema', () => {
    const tables = createdTables(initSql)
    assertUnique(tables, 'database/init.sql')
    assert.deepEqual([...tables].sort(), [...baseTables].sort())

    for (const table of baseTables) {
      assert.match(initSql, new RegExp(`^CREATE TABLE(?: IF NOT EXISTS)? ${escapeRegExp(table)}\\b`, 'im'))
    }
  })

  it('makes the cloud entry self-contained with every base and mold table exactly once', () => {
    const tables = createdTables(cloudSql, true)
    const expected = [...baseTables, ...moldTables]
    assertUnique(tables, 'database/supabase-cloud.sql')
    assert.deepEqual([...tables].sort(), [...expected].sort())

    for (const table of expected) {
      assert.match(cloudSql, new RegExp(`^create table if not exists public\\.${escapeRegExp(table)}\\b`, 'im'))
    }
    assert.doesNotMatch(cloudSql, /^\s*\\(?:i|ir)\b/im)
    assert.doesNotMatch(cloudSql, /database\/supabase-[a-z0-9-]+\.sql/i)
  })

  it('creates referenced objects before dependents, functions, RLS and storage', () => {
    assertBefore(cloudSql, 'create table if not exists public.customer', 'create table if not exists public.product')
    assertBefore(cloudSql, 'create table if not exists public.product', 'create table if not exists public.mold')
    assertBefore(cloudSql, 'create table if not exists public.sale_order', 'create table if not exists public.sale_order_item')
    assertBefore(cloudSql, 'create table if not exists public.prod_order', 'create table if not exists public.prod_report')
    assertBefore(cloudSql, 'create table if not exists public.process_card', 'create table if not exists public.trial_mold_record')
    assertBefore(cloudSql, 'create table if not exists public.workflow_definition', 'create table if not exists public.workflow_instance')
    assertBefore(cloudSql, 'create table if not exists public.mold_development_project', 'create table if not exists public.mold_trial_detail')
    assertBefore(cloudSql, 'create table if not exists public.mold_trial_detail', 'create or replace function public.release_mold_trial')
    assertBefore(cloudSql, 'create or replace function public.can_access_mold_development', '-- 8. Row-level security')
    assertBefore(cloudSql, '-- 8. Row-level security', 'insert into storage.buckets')
    assertBefore(cloudSql, 'insert into storage.buckets', "notify pgrst, 'reload schema';")
    assertBefore(cloudSql, "notify pgrst, 'reload schema';", 'commit;')
  })

  it('covers every admin adapter table and selected column', () => {
    const contracts = adapterTableColumns(adminRequest)
    assert.equal(contracts.length, 56)
    for (const [table, columns] of contracts) {
      const body = cloudObjectBody(table)
      assert.ok(body, `cloud SQL is missing ${table}`)
      for (const column of columns) {
        assert.match(body, new RegExp(`\\b${escapeRegExp(column)}\\b`, 'i'), `${table} is missing ${column}`)
      }
    }
  })
})

describe('repeatable cloud bootstrap DDL', () => {
  it('serializes concurrent bootstrap attempts inside the transaction', () => {
    assert.match(
      cloudSql,
      /^begin;\s+select\s+pg_catalog\.pg_advisory_xact_lock\([\s\S]*?inject-erp:supabase-cloud-bootstrap[\s\S]*?\);/im,
    )
  })

  it('creates every trigger with replacement semantics', () => {
    const triggers = [...cloudSql.matchAll(
      /^[ \t]*create(\s+or\s+replace)?\s+(?:constraint\s+)?trigger\s+([a-z_][a-z0-9_$]*)/gim,
    )]
    assert.ok(triggers.length > 0, 'database/supabase-cloud.sql must create its required triggers')

    const nonRepeatableTriggers = triggers
      .filter((match) => !match[1])
      .map((match) => match[2])

    assert.deepEqual(
      nonRepeatableTriggers,
      [],
      'cloud triggers must use CREATE OR REPLACE TRIGGER so the bootstrap can be rerun',
    )
  })

  it('guards every explicit policy with a pg_policies existence check', () => {
    const identifier = String.raw`(?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)`
    const policyPattern = new RegExp(
      `^[ \\t]*create\\s+policy\\s+(${identifier})\\s+on\\s+(${identifier})\\.(${identifier})`,
      'gim',
    )
    const policies = [...cloudSql.matchAll(policyPattern)]
    const normalizedIdentifier = (value) => (
      value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value.toLowerCase()
    )
    const lowerCloudSql = cloudSql.toLowerCase()

    assert.ok(policies.length > 0, 'database/supabase-cloud.sql must create its required policies')

    for (const policy of policies) {
      const policyName = normalizedIdentifier(policy[1])
      const schemaName = normalizedIdentifier(policy[2])
      const tableName = normalizedIdentifier(policy[3])
      const beforePolicy = cloudSql.slice(0, policy.index)
      const guardStarts = [...beforePolicy.matchAll(/\bif\s+not\s+exists\s*\(/gi)]
      const guardStart = guardStarts.at(-1)?.index ?? -1
      const previousGuardEnd = beforePolicy.toLowerCase().lastIndexOf('end if;')

      assert.ok(
        guardStart > previousGuardEnd,
        `policy ${schemaName}.${tableName}.${policyName} must be inside an IF NOT EXISTS guard`,
      )

      const guard = cloudSql.slice(guardStart, policy.index)
      const catalogLiteral = (column, value) => new RegExp(
        `\\b${column}\\s*=\\s*'${escapeRegExp(value.replaceAll("'", "''"))}'`,
        'i',
      )

      assert.match(
        guard,
        /\bfrom\s+(?:pg_catalog\.)?pg_policies\b/i,
        `policy ${schemaName}.${tableName}.${policyName} must query pg_policies before creation`,
      )
      assert.match(guard, catalogLiteral('schemaname', schemaName))
      assert.match(guard, catalogLiteral('tablename', tableName))
      assert.match(guard, catalogLiteral('policyname', policyName))
      assert.notEqual(
        lowerCloudSql.indexOf('end if;', policy.index + policy[0].length),
        -1,
        `policy ${schemaName}.${tableName}.${policyName} has no closing END IF`,
      )
    }
  })

  it('guards post-table foreign keys with pg_constraint checks', () => {
    for (const constraint of [
      'fk_stock_move_delivery_order',
      'fk_stock_move_delivery_order_item',
      'fk_trial_mold_record_project',
    ]) {
      const pattern = new RegExp(
        `if\\s+not\\s+exists\\s*\\([\\s\\S]*?from\\s+pg_catalog\\.pg_constraint[\\s\\S]*?conname\\s*=\\s*'${constraint}'[\\s\\S]*?\\)\\s*then[\\s\\S]*?add\\s+constraint\\s+${constraint}\\b`,
        'i',
      )
      assert.match(cloudSql, pattern, `${constraint} must be guarded before creation`)
    }
  })

  it('backfills historical columns before dependent references, indexes and constraints', () => {
    const additions = topLevelAddedColumns(cloudSql)

    for (const expected of compatibilityColumns) {
      const matches = additions.filter(({ schema, table, column }) => (
        schema === 'public' && table === expected.table && column === expected.column
      ))
      const label = `public.${expected.table}.${expected.column}`

      assert.equal(matches.length, 1, `${label} must have exactly one compatibility ADD COLUMN`)
      assert.equal(matches[0].guarded, true, `${label} compatibility DDL must use IF NOT EXISTS`)
      assert.match(matches[0].definition, expected.definition, `${label} has an incompatible definition`)

      const tableStart = cloudSql.indexOf(`create table if not exists public.${expected.table}`)
      const tableEnd = cloudSql.indexOf('\n);', tableStart)
      assert.notEqual(tableStart, -1, `missing table creation for public.${expected.table}`)
      assert.notEqual(tableEnd, -1, `incomplete table creation for public.${expected.table}`)
      assert.ok(tableEnd < matches[0].index, `${label} compatibility DDL must follow table creation`)

      for (const dependent of expected.dependents) {
        const dependentIndex = cloudSql.indexOf(dependent)
        assert.notEqual(dependentIndex, -1, `missing dependent marker: ${dependent}`)
        assert.ok(matches[0].index < dependentIndex, `${label} must exist before ${dependent}`)
      }
    }

    assert.match(
      cloudSql,
      /do \$sys_user_auth_unique\$[\s\S]*?from pg_catalog\.pg_index[\s\S]*?indisunique[\s\S]*?indpred is null[\s\S]*?pg_catalog\.pg_get_indexdef[\s\S]*?create unique index uq_sys_user_auth_user_id on public\.sys_user \(auth_user_id\)/i,
      'historical sys_user.auth_user_id must retain a unique Auth mapping',
    )
  })
})

describe('fresh-only and secret-free cloud bootstrap', () => {
  it('contains no destructive reset, legacy migration, include, or privileged key material', () => {
    assert.doesNotMatch(cloudSql, /\b(?:drop|truncate)\b/i)
    assert.doesNotMatch(cloudSql, /service[_-]?role\s+(?:key|secret|token)|VITE_SUPABASE|SUPABASE_(?:KEY|SECRET)|eyJ[A-Za-z0-9_-]{20,}/i)

    const topLevelSql = maskDollarQuoted(cloudSql)
    const disallowedAdditions = topLevelAddedColumns(cloudSql).filter(({ schema, table, column, guarded }) => (
      !guarded || !compatibilityColumnKeys.has(`${schema}.${table}.${column}`)
    ))
    assert.deepEqual(
      disallowedAdditions,
      [],
      'cloud bootstrap may only add explicitly allowlisted compatibility columns with IF NOT EXISTS',
    )
    assert.doesNotMatch(topLevelSql, /^\s*(?:update|delete\s+from)\s+public\./im)
  })

  it('uses one explicit transaction and one PostgREST schema reload', () => {
    assert.equal((cloudSql.match(/^begin;$/gim) || []).length, 1)
    assert.equal((cloudSql.match(/^commit;$/gim) || []).length, 1)
    assert.equal((cloudSql.match(/^notify pgrst, 'reload schema';$/gim) || []).length, 1)
  })
})

describe('RLS, grants and RPC hardening', () => {
  it('covers every public table with authenticated RLS and never disables RLS', () => {
    const rlsSection = cloudSql.slice(cloudSql.indexOf('-- 8. Row-level security'))
    for (const table of [...baseTables.filter((item) => item !== 'sys_user'), ...moldTables]) {
      assert.match(rlsSection, new RegExp(`'${escapeRegExp(table)}'`), `RLS list missing ${table}`)
    }
    assert.match(rlsSection, /alter table public\.sys_user enable row level security;/i)
    assert.match(rlsSection, /alter table public\.%I enable row level security/i)
    assert.match(rlsSection, /create policy %I[\s\S]*to authenticated[\s\S]*using \(\(select public\.current_erp_user_is_active\(\)\)\)/i)
    assert.match(rlsSection, /create policy %I[\s\S]*public\.can_access_mold_development\(\)/i)
    assert.doesNotMatch(cloudSql, /disable row level security/i)
  })

  it('removes anonymous table and RPC access', () => {
    assert.match(cloudSql, /revoke all on all tables in schema public from anon;/i)
    assert.match(cloudSql, /revoke all on all sequences in schema public from anon;/i)
    assert.doesNotMatch(cloudSql, /grant\s+(?:select|insert|update|delete)[^;]*\bto\s+[^;]*\banon\b[^;]*;/i)
    assert.match(cloudSql, /grant select, insert, update, delete on all tables in schema public to authenticated;/i)
    assert.doesNotMatch(cloudSql, /grant execute on function public\.erp_login\(text, text\)/i)
    assert.match(cloudSql, /grant execute on function public\.bind_mold_auth_user\(bigint, uuid\) to supabase_admin;/i)
    assert.match(cloudSql, /grant execute on function public\.bind_mold_auth_user\(bigint, uuid\) to service_role;/i)
    assert.doesNotMatch(
      cloudSql,
      /grant execute on function public\.bind_mold_auth_user\(bigint, uuid\) to (?:anon|authenticated);/i,
    )

    const anonFunctionGrants = [...cloudSql.matchAll(/grant execute on function ([^;]+) to ([^;]*\banon\b[^;]*);/gi)]
    assert.equal(anonFunctionGrants.length, 0)
  })

  it('protects sys_user secrets and restricts mutations to mapped managers', () => {
    const genericRls = cloudSql.slice(cloudSql.indexOf('do $rls$'), cloudSql.indexOf('do $mold_rls$'))
    assert.doesNotMatch(genericRls, /'sys_user'/i)
    assert.match(cloudSql, /create policy sys_user_directory_select[\s\S]*for select[\s\S]*to authenticated/i)
    assert.match(cloudSql, /create policy sys_user_manager_(?:insert|update|delete)/i)
    assert.match(cloudSql, /public\.current_erp_user_is_active\(\)/i)
    assert.match(cloudSql, /public\.current_erp_user_is_manager\(\)/i)
    assert.match(cloudSql, /revoke all on table public\.sys_user from authenticated;/i)
    assert.match(cloudSql, /grant select \([\s\S]*?\) on public\.sys_user to authenticated;/i)
    assert.doesNotMatch(
      cloudSql.match(/grant select \([\s\S]*?\) on public\.sys_user to authenticated;/i)?.[0] || '',
      /password_hash|auth_user_id/i,
    )
  })

  it('allows active users to read system configuration while restricting mutations to managers', () => {
    assert.match(
      cloudSql,
      /alter policy sys_config_authenticated_access on public\.sys_config[\s\S]*?current_erp_user_is_manager\(\)[\s\S]*?with check \(\(select public\.current_erp_user_is_manager\(\)\)\)/i,
    )
    assert.match(
      cloudSql,
      /create policy sys_config_authenticated_select[\s\S]*?for select[\s\S]*?current_erp_user_is_active\(\)/i,
    )
  })

  it('pins search_path on every exposed security-definer RPC', () => {
    for (const name of [
      'erp_login',
      'current_erp_user_profile',
      'current_erp_user_is_active',
      'current_erp_user_is_manager',
      'bind_mold_auth_user',
      'current_mold_actor_id',
      'can_access_mold_development',
      'advance_mold_development_project',
      'transition_mold_revision',
      'transition_mold_trial_issue',
      'release_mold_trial',
    ]) {
      const body = extractFunction(cloudSql, name)
      assert.match(body, /security definer/i, `${name} must be SECURITY DEFINER`)
      assert.match(body, /set search_path\s*=/i, `${name} must pin search_path`)
    }

    for (const name of [
      'advance_mold_development_project',
      'release_mold_trial',
      'transition_mold_revision',
      'transition_mold_trial_issue',
      'validate_mold_project_stage_gate',
    ]) {
      assert.match(cloudSql, new RegExp(`grant execute on function public\\.${name}\\(`, 'i'))
    }
  })
})

describe('single-entry bootstrap and real Auth session integration', () => {
  it('tells operators to run only the self-contained cloud bootstrap', () => {
    assert.match(cloudOps, /全新项目仅执行一次 database\/supabase-cloud\.sql/)
    assert.doesNotMatch(cloudOps, /执行 database\/init\.sql 与 database\/supabase-cloud\.sql/)
    assert.match(dashboard, /database\/supabase-cloud\.sql/)
    assert.doesNotMatch(dashboard, /<el-tag effect="plain">database\/init\.sql<\/el-tag>/)
    assert.match(cloudOps, /Edge Functions -> erp-user-admin/)
    assert.match(dashboard, /supabase\/functions\/erp-user-admin/)
    assert.match(loginPage, /database\/supabase-cloud\.sql/)
    assert.doesNotMatch(loginPage, /supabase-current-login-init\.sql|erp_login|pgcrypto/)
  })

  it('requires a real Supabase Auth session and mapped profile on admin and mobile', () => {
    for (const source of [adminRequest, mobileRequest]) {
      assert.match(source, /auth\.signInWithPassword/)
      assert.match(source, /rpc\('current_erp_user_profile'\)/)
      assert.match(source, /if \(!authResult\.data\.session \|\| !authResult\.data\.user\?\.id\)/)
      assert.match(source, /await supabase\.auth\.signOut\(\)/)
      assert.doesNotMatch(source, /rpc\('erp_login'/)
    }

    assert.match(mobileLoginPage, /v-model\.trim="form\.username"/)
    assert.match(mobileLoginPage, /name="username"/)
    assert.match(mobileLoginPage, /username:\s*form\.username/)
    assert.doesNotMatch(mobileLoginPage, /手机号格式不正确|v-model\.trim="form\.phone"/)
    assert.equal(getErrorMessage(new Error('{}'), '登录失败，请稍后重试'), '登录失败，请稍后重试')
    assert.equal(getErrorMessage({ message: 'Invalid login credentials' }, '登录失败'), 'Invalid login credentials')
  })

  it('migrates legacy local tokens to a real Supabase Auth session without permission-error floods', () => {
    for (const source of [adminAuthSession, mobileAuthSession]) {
      assert.match(source, /auth\.getSession\(\)/)
      assert.match(source, /data\.session\?\.access_token/)
      assert.match(source, /data\.session\.user\?\.id/)
      assert.match(source, /clearStoredAuthContext\(\)/)
      assert.match(source, /synchronizeSupabaseAuthSession/)
    }

    assert.match(adminAuthStorage, /USER_CONTEXT_KEYS[\s\S]*'userId'[\s\S]*'roles'/)
    assert.match(adminAuthStorage, /export function clearStoredAuthContext/)

    for (const source of [adminRouter, mobileRouter]) {
      assert.match(source, /beforeEach\(async/)
      assert.match(source, /await synchronizeSupabaseAuthSession\(\)/)
      assert.doesNotMatch(source, /const token = (?:getStoredToken\(\)|localStorage\.getItem\('token'\))/)
    }

    for (const source of [adminRequest, mobileRequest]) {
      assert.match(source, /const sessionResult = await supabase\.auth\.getSession\(\)/)
      assert.match(source, /permission denied for table/)
      assert.match(source, /await hasActiveSupabaseSession\(\)/)
      assert.doesNotMatch(source, /if \(storedUser\.userId\)/)
    }

    for (const source of [adminApiIndex, mobileApiIndex]) {
      assert.match(source, /let redirectingToLogin = false/)
      assert.match(source, /if \(redirectingToLogin\) return/)
      assert.match(source, /clearStoredAuthContext\(\)/)
    }
  })

  it('never exposes password hashes through user table column contracts', () => {
    for (const source of [adminRequest, mobileRequest]) {
      const sysUserContract = source.match(/^  sys_user: \[([^\n]+)\],?$/m)?.[1] || ''
      assert.doesNotMatch(sysUserContract, /password_hash|auth_user_id/)
    }
    assert.doesNotMatch(adminRequest, /select\('password_hash'\)/)
    assert.match(adminRequest, /SYS_USER_SAFE_SELECT/)
  })

  it('routes user lifecycle changes through a JWT-protected Auth admin function', () => {
    assert.match(adminRequest, /functions\.invoke\('erp-user-admin'/)
    assert.doesNotMatch(adminRequest, /bcrypt\.hashSync|data\.password_hash\s*=/)
    assert.doesNotMatch(adminRequest, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.match(supabaseConfig, /\[functions\.erp-user-admin\][\s\S]*verify_jwt\s*=\s*true/)
    assert.match(userAdminFunction, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/)
    assert.match(userAdminFunction, /admin\.auth\.getUser\(jwt\)/)
    assert.match(userAdminFunction, /managerRoles\.has/)
    assert.match(userAdminFunction, /admin\.auth\.admin\.createUser/)
    assert.match(userAdminFunction, /admin\.auth\.admin\.updateUserById/)
    assert.match(userAdminFunction, /admin\.auth\.admin\.deleteUser/)
    assert.match(userAdminFunction, /admin\.rpc\('bind_mold_auth_user'/)
    assert.match(userAdminFunction, /await admin\.auth\.admin\.deleteUser\(createdAuth\.user\.id\)/)
    assert.doesNotMatch(userAdminFunction, /console\.(?:log|error).*serviceRoleKey/i)
  })
})

describe('administrator Auth bootstrap', () => {
  it('keeps the one-time credential reset retry-safe and free of plaintext secrets', () => {
    assert.notEqual(loginResetBytes[0], 0xef)
    assert.equal(loginResetSql.includes('123456'), false)
    assert.doesNotMatch(loginResetSql, /\b(?:drop|truncate|delete)\b/i)
    assert.match(loginResetSql, /^begin;/im)
    assert.match(loginResetSql, /pg_advisory_xact_lock/i)
    assert.match(loginResetSql, /select app_user\.auth_user_id[\s\S]*where app_user\.username = v_username[\s\S]*for update/i)
    assert.match(loginResetSql, /目标 Auth 邮箱已由其他 UUID 占用/)
    assert.match(loginResetSql, /目标 Auth UUID 已绑定其他系统用户/)
    assert.match(loginResetSql, /已有 Auth UUID 不能确认属于 songjian/)
    assert.match(loginResetSql, /split_part\(coalesce\(v_bound_auth_email/i)
  })

  it('creates the confirmed Auth user, email identity and ERP binding', () => {
    const authUserColumns = loginResetSql.match(/insert into auth\.users\s*\(([\s\S]*?)\)\s*values/i)?.[1] || ''

    assert.match(authUserColumns, /email_confirmed_at/i)
    for (const requiredTokenColumn of [
      'confirmation_token',
      'recovery_token',
      'email_change_token_new',
      'email_change',
    ]) {
      assert.match(authUserColumns, new RegExp(`(^|,)\\s*${requiredTokenColumn}\\s*(,|$)`, 'im'))
      assert.match(loginResetSql, new RegExp(`${requiredTokenColumn}\\s*=\\s*coalesce\\(${requiredTokenColumn},\\s*''\\)`, 'i'))
      assert.match(loginResetSql, new RegExp(`auth_user\\.${requiredTokenColumn}\\s*=\\s*''`, 'i'))
    }
    assert.doesNotMatch(authUserColumns, /(^|,)\s*confirmed_at\s*(,|$)/im)
    assert.match(loginResetSql, /insert into auth\.identities[\s\S]*provider_id[\s\S]*identity_data[\s\S]*provider/i)
    assert.match(loginResetSql, /on conflict \(provider_id, provider\) do update/i)
    assert.match(loginResetSql, /insert into public\.sys_user[\s\S]*auth_user_id[\s\S]*on conflict \(username\) do update/i)
    assert.match(loginResetSql, /songjian@saodtwnvbanjlkwwivcb\.supabase\.co/i)
    assert.match(loginResetSql, /'ok', auth_user_ready and email_identity_ready and sys_user_ready/i)
  })
})

describe('cross-device Supabase runtime configuration', () => {
  const projectUrl = 'https://saodtwnvbanjlkwwivcb.supabase.co'
  const publishableKey = 'sb_publishable_zDACThBqg3ZrBgS4yXwKvg_dyxSAOLM'

  it('ships the same fallback project to admin and mobile while preserving overrides', () => {
    for (const source of [adminSupabaseClient, mobileSupabaseClient]) {
      assert.match(source, new RegExp(projectUrl.replaceAll('.', '\\.')))
      assert.equal(source.includes(publishableKey), true)
      assert.match(source, /VITE_SUPABASE_URL/)
      assert.match(source, /VITE_SUPABASE_ANON_KEY/)
    }

    assert.match(adminSupabaseClient, /resolveSupabaseConnectionConfig\(\{[\s\S]*stored:\s*storedConfig[\s\S]*environment:\s*environmentConnection[\s\S]*fallback:\s*fallbackConnection/)
    assert.match(adminSupabaseClient, /assertSupabaseConnectionCanBeStored\(config, trustedProjectUrls\)/)
    assert.match(mobileSupabaseClient, /const hasEnvironmentConnection = Boolean\(/)
    assert.match(mobileSupabaseClient, /configuredSupabaseUrl[\s\S]*\^sb_publishable_/)
    assert.match(mobileSupabaseClient, /hasEnvironmentConnection \? configuredSupabaseUrl : defaultSupabaseUrl/)
    assert.match(mobileSupabaseClient, /hasEnvironmentConnection \? configuredSupabaseKey : defaultSupabasePublishableKey/)
  })

  it('derives matching Auth email domains from the active project URL', () => {
    assert.equal(resolveSupabaseAuthEmailDomain(projectUrl), 'saodtwnvbanjlkwwivcb.supabase.co')
    assert.equal(resolveSupabaseAuthEmailDomain(projectUrl, 'runtime.example.com', 'env.example.com'), 'runtime.example.com')
    assert.equal(resolveSupabaseAuthEmailDomain(projectUrl, '', 'env.example.com'), 'env.example.com')
    assert.equal(resolveSupabaseAuthEmailDomain(projectUrl, 'inject-erp.example.com'), 'saodtwnvbanjlkwwivcb.supabase.co')
    assert.equal(resolveSupabaseAuthEmailDomain(projectUrl, 'inject-erp.example.com', 'login.company.cn'), 'login.company.cn')

    for (const source of [adminSupabaseClient, mobileSupabaseClient, userAdminFunction]) {
      assert.doesNotMatch(source, /inject-erp\.example\.com/)
      assert.match(source, /resolveSupabaseAuthEmailDomain\(supabaseUrl/)
    }
    assert.match(mobileSupabaseClient, /isPlaceholderAuthEmailDomain/)
    assert.match(userAdminFunction, /Deno\.env\.get\('ERP_AUTH_EMAIL_DOMAIN'\)/)
  })

  it('accepts only the configured confirmation password without bundling its plaintext', async () => {
    assert.equal(await verifySupabaseConfigPassword('song123'), true)
    assert.equal(await verifySupabaseConfigPassword('wrong-password'), false)
    assert.equal(await verifySupabaseConfigPassword(''), false)
    await assert.rejects(() => assertSupabaseConfigPassword('wrong-password'), /配置确认密码错误/)
    assert.doesNotMatch(supabaseConfigSecurity, /song123/)
    assert.match(supabaseConfigSecurity, /subtle\.digest\('SHA-256'/)
  })

  it('rejects secret, legacy JWT and untrusted-project browser overrides', () => {
    const legacyServiceRoleJwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'),
      'signature',
    ].join('.')
    const rotatedPublishableKey = `sb_publishable_${'r'.repeat(24)}`

    assert.equal(isSafeSupabasePublishableKey(publishableKey), true)
    assert.equal(isSafeSupabasePublishableKey('sb_secret_not-for-a-browser'), false)
    assert.equal(isSafeSupabasePublishableKey(legacyServiceRoleJwt), false)
    assert.equal(normalizeSupabaseProjectUrl(`${projectUrl}/`), projectUrl)
    assert.equal(normalizeSupabaseProjectUrl(`${projectUrl}/rest/v1`), '')

    assert.deepEqual(
      assertSupabaseConnectionCanBeStored(
        { url: `${projectUrl}/`, anonKey: rotatedPublishableKey },
        [projectUrl],
      ),
      { url: projectUrl, anonKey: rotatedPublishableKey },
    )
    assert.throws(
      () => assertSupabaseConnectionCanBeStored(
        { url: 'https://attacker-project.supabase.co', anonKey: rotatedPublishableKey },
        [projectUrl],
      ),
      /只允许使用程序内置或部署环境中的 Supabase 项目 URL/,
    )
    assert.throws(
      () => assertSupabaseConnectionCanBeStored(
        { url: projectUrl, anonKey: legacyServiceRoleJwt },
        [projectUrl],
      ),
      /sb_publishable_/,
    )
  })

  it('uses stored, deployment and built-in configuration in a safe deterministic order', () => {
    const deployment = {
      url: 'https://trusted-deployment.supabase.co',
      anonKey: `sb_publishable_${'d'.repeat(24)}`,
    }
    const fallback = { url: projectUrl, anonKey: publishableKey }
    const stored = { url: projectUrl, anonKey: `sb_publishable_${'s'.repeat(24)}` }

    assert.deepEqual(resolveSupabaseConnectionConfig({ stored, environment: deployment, fallback }), {
      config: stored,
      source: 'stored',
    })
    assert.deepEqual(resolveSupabaseConnectionConfig({
      stored: { url: 'https://attacker-project.supabase.co', anonKey: stored.anonKey },
      environment: deployment,
      fallback,
    }), {
      config: deployment,
      source: 'environment',
    })
    assert.deepEqual(resolveSupabaseConnectionConfig({
      stored: { url: projectUrl, anonKey: 'legacy-secret-jwt' },
      environment: { url: deployment.url, anonKey: 'sb_secret_invalid' },
      fallback,
    }), {
      config: fallback,
      source: 'fallback',
    })
  })

  it('gates save and reset at the API layer and in both configuration dialogs', () => {
    assert.match(adminSupabaseClient, /async function saveSupabaseRuntimeConfig\([^)]*confirmationPassword/)
    assert.match(adminSupabaseClient, /async function clearSupabaseRuntimeConfig\(confirmationPassword/)
    assert.equal((adminSupabaseClient.match(/await assertSupabaseConfigPassword\(confirmationPassword\)/g) || []).length, 2)

    for (const page of [loginPage, dashboard]) {
      assert.match(page, /prop="confirmationPassword"/)
      assert.match(page, /name="supabase-config-confirmation-password"/)
      assert.match(page, /autocomplete="new-password"/)
      assert.match(page, /class="supabase-config-dialog"/)
      assert.match(page, /max-height:\s*92vh/)
      assert.match(page, /await saveSupabaseRuntimeConfig\([^\n]+confirmationPassword\)/)
      assert.match(page, /await clearSupabaseRuntimeConfig\([^\n]+confirmationPassword\)/)
      assert.match(page, /恢复部署默认/)
    }
  })
})

describe('Supabase storage access contract', () => {
  it('keeps normal attachments public and mold-development attachments private', () => {
    assert.match(cloudSql, /\('erp-files', 'erp-files', true\)/i)
    assert.match(cloudSql, /\('erp-mold-development', 'erp-mold-development', false\)/i)
    assert.match(cloudSql, /on conflict \(id\) do update set public = excluded\.public;/i)
    assert.doesNotMatch(cloudSql, /\('erp-mold-development', 'erp-mold-development', true\)/i)
  })

  it('allows public normal-file reads while keeping every write authenticated', () => {
    assert.match(cloudSql, /create policy erp_files_public_select[\s\S]*?to public[\s\S]*?bucket_id = 'erp-files'/i)
    for (const operation of ['insert', 'update', 'delete']) {
      assert.match(
        cloudSql,
        new RegExp(`create policy erp_files_authenticated_${operation}[\\s\\S]*?to authenticated`, 'i'),
        `erp-files is missing authenticated ${operation}`,
      )
    }
    assert.match(cloudSql, /create policy erp_files_authenticated_insert[\s\S]*current_erp_user_is_active\(\)/i)
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      assert.match(
        cloudSql,
        new RegExp(`create policy mold_development_files_${operation}[\\s\\S]*?to authenticated`, 'i'),
        `erp-mold-development is missing authenticated ${operation}`,
      )
    }
    assert.match(cloudSql, /bucket_id = 'erp-mold-development'[\s\S]*storage\.foldername\(name\)[\s\S]*'mold-development'/i)
    assert.doesNotMatch(cloudSql, /on storage\.objects[\s\S]{0,120}\bto anon\b/i)
  })
})
