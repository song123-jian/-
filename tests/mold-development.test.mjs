import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  MOLD_DEVELOPMENT_STAGES,
  calculateLifeForecast,
  nextDevelopmentStage,
  riskTagType,
  totalOf,
  validateMoldTrialRelease,
} from '../frontend-admin/src/utils/mold-development.ts'

const moldDevelopmentPage = readFileSync(new URL('../frontend-admin/src/views/prod/mold-development.vue', import.meta.url), 'utf8')
const moldDevelopmentSql = readFileSync(new URL('../database/supabase-mold-development.sql', import.meta.url), 'utf8')
const moldDevelopmentApi = readFileSync(new URL('../frontend-admin/src/api/moldDevelopment.ts', import.meta.url), 'utf8')
const supabaseRequestAdapter = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')

describe('mold development stage flow', () => {
  it('advances through the first five stages in order without skipping a stage', () => {
    const expectedStages = ['REQUIREMENT', 'DFM', 'DESIGN', 'MACHINING', 'T0']
    assert.deepEqual(MOLD_DEVELOPMENT_STAGES.slice(0, 5).map((item) => item.code), expectedStages)

    for (let index = 0; index < expectedStages.length - 1; index += 1) {
      assert.equal(nextDevelopmentStage(expectedStages[index]).code, expectedStages[index + 1])
    }
    assert.equal(nextDevelopmentStage('t0').code, 'T1')
  })

  it('covers the complete configured flow and keeps the terminal stage stable', () => {
    const stageCodes = MOLD_DEVELOPMENT_STAGES.map((item) => item.code)
    for (let index = 0; index < stageCodes.length - 1; index += 1) {
      assert.equal(nextDevelopmentStage(stageCodes[index]).code, stageCodes[index + 1])
    }
    assert.equal(nextDevelopmentStage('CLOSED').code, 'CLOSED')
    assert.equal(nextDevelopmentStage('unknown').code, 'REQUIREMENT')
  })
})

describe('mold trial release gates', () => {
  const releasableTrial = {
    projectId: 42,
    trialStage: 'T2',
    dimensionResult: 'PASS',
    qualityResult: 'PASS',
    productionResult: 'PASS',
    firstPass: true,
  }

  it('blocks each release gate independently', () => {
    const cases = [
      ['trial stage', { trialStage: 'T1' }],
      ['dimension result', { dimensionResult: 'PENDING' }],
      ['quality result', { qualityResult: 'FAIL' }],
      ['production result', { productionResult: 'PENDING' }],
      ['first-pass flag', { firstPass: false }],
    ]

    for (const [name, override] of cases) {
      const result = validateMoldTrialRelease({ ...releasableTrial, ...override }, [
        { projectId: 42, attachmentType: 'ACCEPTANCE', status: 'ACTIVE' },
      ])
      assert.equal(result.passed, false, `${name} should block release`)
      assert.equal(result.blockers.length, 1, `${name} should produce one blocker`)
    }
  })

  it('accepts PILOT and API field aliases, and ignores void acceptance attachments', () => {
    const result = validateMoldTrialRelease({
      trial_stage: 'pilot',
      dimension_result: 'qualified',
      quality_result: 'approved',
      production_result: 'ok',
      first_pass: 'YES',
      project_id: 42,
    }, [
      { project_id: 42, attachment_type: 'acceptance', status: 'void' },
      { project_id: 42, attachment_type: 'ACCEPTANCE', status: 'ACTIVE' },
    ])

    assert.deepEqual(result, { passed: true, blockers: [], warnings: [] })
  })

  it('requires a correction action when a defect summary is present', () => {
    const closedIssue = {
      issueSeverity: 'HIGH',
      correctionStatus: 'CLOSED',
      retestResult: 'PASS',
      closureEvidence: 'T2复试报告 TR-42',
    }
    const blocked = validateMoldTrialRelease({
      ...releasableTrial,
      ...closedIssue,
      defectSummary: 'short shot',
      correctionAction: '  ',
    }, [{ projectId: 42, attachmentType: 'ACCEPTANCE', status: 'ACTIVE' }])
    assert.equal(blocked.passed, false)
    assert.equal(blocked.blockers.length, 1)

    const cleared = validateMoldTrialRelease({
      ...releasableTrial,
      ...closedIssue,
      defect_summary: 'short shot',
      correction_action: 'adjusted and rechecked',
    }, [{ projectId: 42, attachmentType: 'ACCEPTANCE', status: 'ACTIVE' }])
    assert.equal(cleared.passed, true)
  })

  it('blocks missing or unrelated acceptance evidence', () => {
    const missing = validateMoldTrialRelease({ ...releasableTrial, projectId: 7 })
    assert.equal(missing.passed, false)
    assert.match(missing.blockers.join('；'), /验收资料/)

    const unrelated = validateMoldTrialRelease({ ...releasableTrial, projectId: 7 }, [
      { projectId: 8, attachmentType: 'ACCEPTANCE', status: 'ACTIVE' },
    ])
    assert.equal(unrelated.passed, false)
    assert.match(unrelated.blockers.join('；'), /验收资料/)
  })
})

describe('mold life forecast', () => {
  it('normalizes numeric strings and calculates remaining life and days', () => {
    const result = calculateLifeForecast({ lifetime: '100000', usedShots: '5000', avgDailyShots: '250' })

    assert.equal(result.lifetime, 100000)
    assert.equal(result.usedShots, 5000)
    assert.equal(result.remainingShots, 95000)
    assert.equal(result.avgDailyShots, 250)
    assert.equal(result.estimatedDaysToLife, 380)
    assert.equal(result.lifeRate, 0.05)
    assert.equal(result.riskLevel, 'NORMAL')
  })

  it('uses risk boundaries for warning and overdue molds', () => {
    assert.equal(calculateLifeForecast({ lifetime: 100, usedShots: 90 }).riskLevel, 'WARNING')
    assert.equal(calculateLifeForecast({ lifetime: 100, usedShots: 100 }).riskLevel, 'OVERDUE')
    assert.equal(calculateLifeForecast({ lifetime: 0, usedShots: 0 }).riskLevel, 'NORMAL')
    assert.equal(calculateLifeForecast({ lifetime: 100, usedShots: 5, riskLevel: 'MAINTENANCE' }).riskLevel, 'MAINTENANCE')
  })

  it('clamps exhausted life and avoids a false day estimate without usage', () => {
    const result = calculateLifeForecast({ lifetime: 100, usedShots: 150, avgDailyShots: 0 })
    assert.equal(result.remainingShots, 0)
    assert.equal(result.estimatedDaysToLife, 0)
    assert.equal(result.riskLevel, 'OVERDUE')
    assert.equal(riskTagType('overdue'), 'danger')
    assert.equal(riskTagType('normal'), 'success')
  })

  it('preserves explicit zero values returned by the database view', () => {
    const result = calculateLifeForecast({ lifetime: 100, usedShots: 10, remainingShots: 0, avgDailyShots: 10, estimatedDaysToLife: 0 })
    assert.equal(result.remainingShots, 0)
    assert.equal(result.estimatedDaysToLife, 0)
  })
})

describe('mold development cost and supplier scoring contracts', () => {
  it('sums actual cost amounts while ignoring invalid or missing values', () => {
    assert.equal(totalOf([
      { actualAmount: '120.50' },
      { actualAmount: 9.5 },
      { actualAmount: 'invalid' },
      { actualAmount: null },
    ], 'actualAmount'), 130)
  })

  it('keeps page-level cost fallback and supplier average score logic wired', () => {
    assert.match(moldDevelopmentPage, /function projectActualCost\(row: any\)/)
    assert.match(moldDevelopmentPage, /reduce\(\(sum, item\) => sum \+ numberOf\(item\.actualAmount\), 0\) \|\| numberOf\(row\.actualAmount\)/)
    assert.match(moldDevelopmentPage, /form\.totalScore = \(\(numberOf\(form\.deliveryScore\) \+ numberOf\(form\.qualityScore\) \+ numberOf\(form\.responseScore\)\) \/ 3\)\.toFixed\(2\)/)
    assert.match(moldDevelopmentPage, /prop="totalScore" label="[^"]*"/)
  })
})

describe('multi-product cavity contracts', () => {
  it('keeps product cavity range and count fields in the page and schema', () => {
    assert.match(moldDevelopmentPage, /function cavityText\(row: any\)/)
    assert.match(moldDevelopmentPage, /cavityStart.*cavityEnd.*cavityCount/)
    assert.match(moldDevelopmentPage, /openForm\('moldProduct'\)/)
    assert.match(moldDevelopmentSql, /create table if not exists public\.mold_product[\s\S]*cavity_start int[\s\S]*cavity_end int[\s\S]*cavity_count int/)
    assert.match(moldDevelopmentSql, /constraint uq_mold_product unique \(mold_id, product_id\)/)
  })
})

describe('mold development database safety contracts', () => {
  it('retains server-side release validation and life forecast sources', () => {
    assert.match(moldDevelopmentSql, /create or replace function public\.validate_mold_trial_release/)
    assert.match(moldDevelopmentSql, /create trigger trg_validate_mold_trial_release/)
    assert.match(moldDevelopmentSql, /create or replace view public\.mold_life_forecast/)
    assert.match(moldDevelopmentSql, /greatest\(coalesce\(m\.lifetime, 0\) - coalesce\(m\.used_shots, 0\), 0\)/)
  })

  it('keeps project creation, advancement, release and trial exceptions transactional', () => {
    assert.match(moldDevelopmentSql, /create or replace function public\.seed_mold_project_milestones/)
    assert.match(moldDevelopmentSql, /create or replace function public\.advance_mold_development_project/)
    assert.match(moldDevelopmentSql, /create or replace function public\.release_mold_trial/)
    assert.match(moldDevelopmentSql, /create or replace function public\.sync_mold_trial_andon/)
    assert.match(moldDevelopmentSql, /create unique index if not exists uq_andon_mold_trial_source/)
    assert.match(moldDevelopmentPage, /advanceMoldDevelopmentProject\(Number\(row\.id\)\)/)
    assert.match(moldDevelopmentPage, /releaseMoldTrialRecord\(Number\(row\.id\)\)/)
    assert.match(moldDevelopmentApi, /mold-development-projects\/\$\{id\}\/advance/)
    assert.match(moldDevelopmentApi, /mold-trial-details\/\$\{id\}\/release/)
    assert.match(supabaseRequestAdapter, /rpc\('advance_mold_development_project'/)
    assert.match(supabaseRequestAdapter, /rpc\('release_mold_trial'/)
  })

  it('enforces revision approval, cost sync, storage and data-integrity contracts', () => {
    assert.match(moldDevelopmentSql, /create or replace function public\.guard_mold_revision_state/)
    assert.match(moldDevelopmentSql, /create or replace function public\.transition_mold_revision/)
    assert.match(moldDevelopmentSql, /create or replace function public\.sync_mold_project_actual_cost/)
    assert.match(moldDevelopmentSql, /constraint ck_mold_evaluation_scores/)
    assert.match(moldDevelopmentSql, /constraint fk_mold_trial_project/)
    assert.match(moldDevelopmentSql, /mold_development_files_insert/)
    assert.doesNotMatch(moldDevelopmentSql, /erp_files_public_(update|delete)/)
    assert.match(moldDevelopmentPage, /changeRevisionStatus\(row, 'SUBMIT'\)/)
    assert.match(moldDevelopmentPage, /changeRevisionStatus\(row, 'APPROVE'\)/)
    assert.match(moldDevelopmentApi, /mold-revisions\/\$\{id\}\/transition/)
    assert.match(supabaseRequestAdapter, /rpc\('transition_mold_revision'/)
    assert.match(moldDevelopmentApi, /mold-development\/files\/signed-url/)
    assert.match(supabaseRequestAdapter, /supabase-storage:\/\/[\s\S]*createSignedUrl\(path, 300\)/)
    assert.match(moldDevelopmentPage, /getMoldDevelopmentFileUrl\(String\(row\.fileUrl\)\)/)
  })

  it('keeps real user and original trial lookups plus mobile single-column forms', () => {
    assert.match(moldDevelopmentPage, /lookup: 'users'/)
    assert.match(moldDevelopmentPage, /lookup: 'trialRecords'/)
    assert.match(moldDevelopmentPage, /fetchResource\('trial-mold-records',\s*\{\s*projectId:/)
    assert.match(moldDevelopmentPage, /\.development-form :deep\(\.el-col-12\)/)
    assert.match(moldDevelopmentPage, /v-loading="loading \|\| contextLoading"/)
    assert.match(supabaseRequestAdapter, /table: 'mold_life_forecast'[\s\S]*defaultOrder: 'mold_id'[\s\S]*idColumn: 'mold_id'[\s\S]*readOnly: true/)
    assert.match(supabaseRequestAdapter, /if \(route\.readOnly\) throw new Error/)
  })

  it('keeps project-scoped loading, issue defaults and refresh guards wired', () => {
    assert.match(moldDevelopmentPage, /projectPageSize = ref\(20\)/)
    assert.match(moldDevelopmentPage, /const requestKeyword = projectKeyword\.value[\s\S]*keyword: requestKeyword/)
    assert.match(moldDevelopmentPage, /let projectRequestId = 0[\s\S]*const requestId = \+\+projectRequestId[\s\S]*requestId !== projectRequestId/)
    assert.match(moldDevelopmentPage, /const requestId = contextRequestId[\s\S]*requestId !== contextRequestId[\s\S]*tab !== activeTab\.value/)
    assert.match(moldDevelopmentPage, /issueSeverity: 'NOT_REQUIRED'[\s\S]*retestResult: 'NOT_REQUIRED'/)
    assert.doesNotMatch(moldDevelopmentPage, /issueSeverity: 'NONE'/)
    assert.match(moldDevelopmentPage, /releaseMoldTrialRecord\(Number\(row\.id\)\)[\s\S]*await loadProjects\(\)[\s\S]*await refreshCurrentProject\(\)/)
    assert.match(moldDevelopmentPage, /retestResult \|\| ''\)\.toUpperCase\(\) !== 'PASS'/)
    assert.match(moldDevelopmentPage, /status === 'WAIT_RETEST'[\s\S]*retestResult[\s\S]*=== 'FAIL'[\s\S]*label: '继续整改'/)
    assert.doesNotMatch(supabaseRequestAdapter.match(/async function transitionMoldRevision[\s\S]*?\n\}/)?.[0] || '', /p_actor_id/)
    assert.match(supabaseRequestAdapter, /delete data\.auth_user_id/)
    assert.doesNotMatch(supabaseRequestAdapter, /sys_user: \[[^\]]*auth_user_id/)
  })
})
