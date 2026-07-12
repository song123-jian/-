import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import * as moldDevelopment from '../frontend-admin/src/utils/mold-development.ts'

const moldDevelopmentSql = readFileSync(new URL('../database/supabase-mold-development.sql', import.meta.url), 'utf8')

function validateIssue(row) {
  assert.equal(typeof moldDevelopment.validateMoldTrialIssue, 'function')
  return moldDevelopment.validateMoldTrialIssue(row)
}

describe('mold trial issue gates', () => {
  it('exposes severity, correction status and retest result options', () => {
    assert.deepEqual(
      moldDevelopment.MOLD_TRIAL_ISSUE_SEVERITY_OPTIONS?.map((item) => item.value),
      ['NOT_REQUIRED', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKER'],
    )
    assert.deepEqual(
      moldDevelopment.MOLD_TRIAL_ISSUE_STATUS_OPTIONS?.map((item) => item.value),
      ['NOT_REQUIRED', 'OPEN', 'IN_PROGRESS', 'WAIT_RETEST', 'CLOSED'],
    )
    assert.deepEqual(
      moldDevelopment.MOLD_TRIAL_RETEST_RESULT_OPTIONS?.map((item) => item.value),
      ['NOT_REQUIRED', 'PENDING', 'PASS', 'FAIL'],
    )
  })

  it('allows NOT_REQUIRED issue fields when no defect exists', () => {
    assert.deepEqual(validateIssue({
      issue_severity: 'NOT_REQUIRED',
      correction_status: 'NOT_REQUIRED',
      retest_result: 'NOT_REQUIRED',
    }), { passed: true, blockers: [], warnings: [] })
  })

  it('requires every defect closure gate independently', () => {
    const closedIssue = {
      defectSummary: 'short shot',
      issueSeverity: 'HIGH',
      correctionAction: 'increase holding pressure',
      correctionStatus: 'CLOSED',
      retestResult: 'PASS',
      closureEvidence: 'T1 dimensional report ATT-42',
    }
    const cases = [
      ['severity', { issueSeverity: 'NOT_REQUIRED' }],
      ['correction action', { correctionAction: ' ' }],
      ['closed status', { correctionStatus: 'WAIT_RETEST' }],
      ['passing retest', { retestResult: 'FAIL' }],
      ['closure evidence', { closureEvidence: '' }],
    ]

    for (const [name, override] of cases) {
      const result = validateIssue({ ...closedIssue, ...override })
      assert.equal(result.passed, false, `${name} should block issue closure`)
      assert.equal(result.blockers.length, 1, `${name} should produce one blocker`)
    }
    assert.deepEqual(validateIssue(closedIssue), { passed: true, blockers: [], warnings: [] })
  })

  it('applies the issue gate during release and supports database field aliases', () => {
    const releasableTrial = {
      project_id: 42,
      trial_stage: 'T2',
      dimension_result: 'PASS',
      quality_result: 'PASS',
      production_result: 'PASS',
      first_pass: true,
      defect_summary: 'flash',
      issue_severity: 'BLOCKER',
      correction_action: 'adjust clamp force',
      correction_status: 'CLOSED',
      retest_result: 'PASS',
      closure_evidence: 'trial report TR-42',
    }
    const attachments = [{ project_id: 42, attachment_type: 'ACCEPTANCE', status: 'ACTIVE' }]

    assert.equal(moldDevelopment.validateMoldTrialRelease(releasableTrial, attachments).passed, true)
    assert.equal(moldDevelopment.validateMoldTrialRelease({
      ...releasableTrial,
      closure_evidence: '',
    }, attachments).passed, false)
  })
})

function validateStageGate(project, context = {}) {
  assert.equal(typeof moldDevelopment.validateMoldProjectStageGate, 'function')
  return moldDevelopment.validateMoldProjectStageGate(project, context)
}

describe('mold project stage gates', () => {
  const project = {
    id: 42,
    ownerId: 7,
    plannedDueDate: '2026-12-31',
    requirement: '32-cavity connector mold',
    moldId: 11,
    productId: 12,
  }

  it('validates requirement data before advancing to DFM', () => {
    assert.deepEqual(validateStageGate({ ...project, currentStage: 'REQUIREMENT' }), {
      passed: true,
      blockers: [],
      warnings: [],
      nextStage: 'DFM',
    })

    const blocked = validateStageGate({ id: 42, current_stage: 'REQUIREMENT' })
    assert.equal(blocked.passed, false)
    assert.equal(blocked.blockers.length, 3)
    assert.equal(blocked.nextStage, 'DFM')
  })

  it('requires the current milestone deliverable at DFM and MACHINING', () => {
    for (const [stage, nextStage] of [['DFM', 'DESIGN'], ['MACHINING', 'T0']]) {
      const context = {
        milestones: [
          { projectId: 99, stageCode: stage, deliverable: 'unrelated' },
          { project_id: 42, stage_code: stage, deliverable: 'signed deliverable' },
        ],
      }
      assert.equal(validateStageGate({ ...project, currentStage: stage }, context).passed, true)
      assert.equal(validateStageGate({ ...project, currentStage: stage }, {}).nextStage, nextStage)
      assert.equal(validateStageGate({ ...project, currentStage: stage }, {}).passed, false)
    }
  })

  it('requires an approved or effective project revision at DESIGN', () => {
    const blocked = validateStageGate({ ...project, currentStage: 'DESIGN' }, {
      revisions: [
        { projectId: 42, status: 'VOID' },
        { projectId: 99, status: 'EFFECTIVE' },
      ],
    })
    assert.equal(blocked.passed, false)

    const passed = validateStageGate({ ...project, currentStage: 'DESIGN' }, {
      revisions: [{ project_id: 42, status: 'approved' }],
    })
    assert.equal(passed.passed, true)
    assert.equal(passed.nextStage, 'MACHINING')
  })

  it('requires the matching T0 or T1 trial and blocks unresolved severe issues', () => {
    for (const stage of ['T0', 'T1']) {
      const missingTrial = validateStageGate({ ...project, currentStage: stage }, { trials: [] })
      assert.equal(missingTrial.passed, false)

      const unresolved = validateStageGate({ ...project, currentStage: stage }, {
        trials: [
          { projectId: 42, trialStage: stage },
          { projectId: 42, trialStage: 'T0', issueSeverity: 'HIGH', correctionStatus: 'WAIT_RETEST' },
        ],
      })
      assert.equal(unresolved.passed, false)

      const resolved = validateStageGate({ ...project, currentStage: stage }, {
        trials: [
          { project_id: 42, trial_stage: stage },
          { project_id: 42, trial_stage: 'T0', issue_severity: 'BLOCKER', correction_status: 'CLOSED' },
          { project_id: 99, trial_stage: stage, issue_severity: 'BLOCKER', correction_status: 'OPEN' },
        ],
      })
      assert.equal(resolved.passed, true)
    }
  })

  it('requires production approval at T2 and active acceptance evidence at ACCEPTANCE', () => {
    assert.equal(validateStageGate({ ...project, currentStage: 'T2' }, {
      trials: [{ projectId: 42, status: 'WAIT_CONFIRM' }],
    }).passed, false)
    assert.equal(validateStageGate({ ...project, currentStage: 'T2' }, {
      trials: [{ project_id: 42, status: 'APPROVED_PRODUCTION' }],
    }).passed, true)

    assert.equal(validateStageGate({ ...project, currentStage: 'ACCEPTANCE' }, {
      attachments: [{ projectId: 42, attachmentType: 'ACCEPTANCE', status: 'VOID' }],
    }).passed, false)
    const acceptance = validateStageGate({ ...project, currentStage: 'ACCEPTANCE' }, {
      attachments: [{ project_id: 42, attachment_type: 'acceptance', status: 'ACTIVE' }],
    })
    assert.equal(acceptance.passed, true)
    assert.equal(acceptance.nextStage, 'HANDOVER')
  })

  it('requires mold, product and active handover evidence before closure', () => {
    const blocked = validateStageGate({ id: 42, currentStage: 'HANDOVER' }, { attachments: [] })
    assert.equal(blocked.passed, false)
    assert.equal(blocked.blockers.length, 3)

    const passed = validateStageGate({ ...project, currentStage: 'HANDOVER' }, {
      attachments: [{ projectId: 42, attachmentType: 'HANDOVER', status: '' }],
    })
    assert.equal(passed.passed, true)
    assert.equal(passed.nextStage, 'CLOSED')
  })

  it('never advances CLOSED projects', () => {
    const result = validateStageGate({ ...project, currentStage: 'closed' })
    assert.equal(result.passed, false)
    assert.equal(result.nextStage, 'CLOSED')
    assert.equal(result.blockers.length, 1)
  })
})

function sqlFunction(name) {
  const match = moldDevelopmentSql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'))
  assert.ok(match, `${name} SQL function should exist`)
  return match[0]
}

describe('mold development stage-gate SQL contracts', () => {
  it('adds trial issue fields idempotently with constraints, foreign keys and indexes', () => {
    const columns = [
      'issue_severity',
      'issue_owner_id',
      'correction_due_date',
      'correction_status',
      'retest_result',
      'closure_evidence',
      'closed_by',
      'closed_at',
    ]
    for (const column of columns) {
      assert.match(moldDevelopmentSql, new RegExp(`alter table public\\.mold_trial_detail[\\s\\S]*?add column if not exists ${column}\\b`, 'i'))
    }

    assert.match(moldDevelopmentSql, /constraint fk_mold_trial_issue_owner foreign key \(issue_owner_id\) references public\.sys_user\(id\)/i)
    assert.match(moldDevelopmentSql, /constraint fk_mold_trial_closed_by foreign key \(closed_by\) references public\.sys_user\(id\)/i)
    assert.match(moldDevelopmentSql, /constraint ck_mold_trial_issue_values check/i)
    assert.match(moldDevelopmentSql, /constraint ck_mold_trial_issue_consistency check/i)
    assert.match(moldDevelopmentSql, /ck_mold_trial_issue_consistency check[\s\S]*not valid/i)
    assert.match(moldDevelopmentSql, /validate constraint ck_mold_trial_issue_consistency/i)
    assert.match(moldDevelopmentSql, /create index if not exists idx_mold_trial_detail_issue_gate/i)
    assert.match(moldDevelopmentSql, /create trigger trg_guard_sys_user_auth_binding[\s\S]*before insert or update of auth_user_id/i)
    const authGuard = sqlFunction('guard_sys_user_auth_binding')
    assert.match(authGuard, /current_user not in \('postgres', 'supabase_admin', 'service_role'\)/i)
    assert.match(authGuard, /auth\.role\(\)[\s\S]*service_role/i)
    const bindAuthUser = sqlFunction('bind_mold_auth_user')
    assert.match(bindAuthUser, /from auth\.users[\s\S]*set auth_user_id\s*=\s*p_auth_user_id/i)
    assert.match(moldDevelopmentSql, /grant execute on function public\.bind_mold_auth_user\(bigint, uuid\) to service_role;/i)
    assert.doesNotMatch(moldDevelopmentSql, /grant execute on function public\.bind_mold_auth_user\(bigint, uuid\) to (anon|authenticated)/i)
  })

  it('implements every project stage rule and invokes the gate before advancement', () => {
    const gate = sqlFunction('validate_mold_project_stage_gate')
    for (const token of [
      'REQUIREMENT', 'DFM', 'DESIGN', 'MACHINING', 'T0', 'T1', 'T2', 'ACCEPTANCE', 'HANDOVER', 'CLOSED',
      'mold_project_milestone', 'mold_revision', 'mold_trial_detail', 'mold_attachment',
      'issue_severity', 'correction_status', 'APPROVED_PRODUCTION',
    ]) {
      assert.match(gate, new RegExp(token, 'i'))
    }
    assert.match(gate, /jsonb_build_object\([\s\S]*'passed'[\s\S]*'blockers'[\s\S]*'warnings'[\s\S]*'nextStage'/i)

    const advance = sqlFunction('advance_mold_development_project')
    assert.match(advance, /validate_mold_project_stage_gate\(p_project_id\)/i)
    assert.match(advance, /gate_result\s*->>\s*'passed'/i)
  })

  it('supports controlled issue transitions and enforces close prerequisites', () => {
    const actor = sqlFunction('current_mold_actor_id')
    assert.match(actor, /auth\.uid\(\)/i)
    assert.match(actor, /auth_user_id\s*=\s*auth\.uid\(\)/i)
    assert.match(actor, /status::text[\s\S]*ACTIVE[\s\S]*ENABLED/i)
    assert.doesNotMatch(actor, /auth\.jwt\(\)|split_part|update public\.sys_user/i)

    const access = sqlFunction('can_access_mold_development')
    assert.match(access, /auth\.uid\(\)[\s\S]*auth_user_id[\s\S]*status::text/i)
    assert.doesNotMatch(access, /auth\.jwt\(\)|split_part|username|phone/i)

    const transition = sqlFunction('transition_mold_trial_issue')
    for (const action of ['START', 'WAIT_RETEST', 'CLOSE', 'REOPEN']) {
      assert.match(transition, new RegExp(`'${action}'`, 'i'))
    }
    assert.match(transition, /retest_result[\s\S]*PASS/i)
    assert.match(transition, /correction_action/i)
    assert.match(transition, /closure_evidence/i)
    assert.match(transition, /closed_by/i)
    assert.match(transition, /closed_at/i)
    assert.match(transition, /current_mold_actor_id\(\)/i)
    assert.doesNotMatch(transition, /p_actor_id/i)
    assert.match(transition, /current_status\s*=\s*'WAIT_RETEST'[\s\S]*retest_result[\s\S]*<>\s*'FAIL'/i)
    assert.match(transition, /issue_owner_id[\s\S]*coalesce\(issue_owner_id, actor_id\)/i)

    const releaseTrigger = sqlFunction('validate_mold_trial_release')
    for (const field of ['issue_severity', 'correction_action', 'correction_status', 'retest_result', 'closure_evidence']) {
      assert.match(releaseTrigger, new RegExp(field, 'i'))
    }
    assert.match(releaseTrigger, /tg_op\s*=\s*'INSERT'[\s\S]*待整改状态创建/i)
    assert.match(releaseTrigger, /app\.mold_trial_release[\s\S]*量产放行状态必须通过放行流程变更/i)
    assert.match(releaseTrigger, /project\.current_stage[\s\S]*=\s*'T2'/i)
  })

  it('prevents release from bypassing project stage gates', () => {
    const release = sqlFunction('release_mold_trial')
    assert.match(release, /current_mold_actor_id\(\)/i)
    assert.match(release, /current_stage[\s\S]*<>\s*'T2'/i)
    assert.match(release, /set_config\('app\.mold_trial_release', 'allowed', true\)/i)
    assert.match(release, /validate_mold_project_stage_gate\(trial_row\.project_id\)/i)
    assert.doesNotMatch(release, /set current_stage\s*=\s*'HANDOVER'/i)
    assert.doesNotMatch(release, /stage_code in \('T0', 'T1', 'T2', 'ACCEPTANCE'\)/i)
  })

  it('grants every mutating function only to authenticated callers', () => {
    for (const signature of [
      'validate_mold_project_stage_gate\\(bigint\\)',
      'transition_mold_trial_issue\\(bigint, text, text\\)',
      'advance_mold_development_project\\(bigint\\)',
      'release_mold_trial\\(bigint\\)',
      'transition_mold_revision\\(bigint, text\\)',
    ]) {
      assert.match(moldDevelopmentSql, new RegExp(`revoke all on function public\\.${signature} from public;`, 'i'))
      assert.match(moldDevelopmentSql, new RegExp(`grant execute on function public\\.${signature} to authenticated;`, 'i'))
      assert.doesNotMatch(moldDevelopmentSql, new RegExp(`grant execute on function public\\.${signature} to[^;]*anon`, 'i'))
    }
    assert.match(moldDevelopmentSql, /alter table public\.%I enable row level security/i)
    assert.match(moldDevelopmentSql, /create policy %I[\s\S]*using \(public\.can_access_mold_development\(\)\)/i)
    assert.match(moldDevelopmentSql, /create or replace view public\.mold_life_forecast[\s\S]*where public\.can_access_mold_development\(\);/i)
    assert.match(moldDevelopmentSql, /revoke all on table[\s\S]*from public, anon;/i)
    assert.doesNotMatch(moldDevelopmentSql, /grant select, insert, update, delete on table[\s\S]*to anon/i)
    assert.match(moldDevelopmentSql, /create policy mold_development_files_insert[\s\S]*to authenticated/i)
    assert.doesNotMatch(moldDevelopmentSql, /create policy mold_development_files_insert[\s\S]*to anon/i)
    assert.match(moldDevelopmentSql, /values \('erp-mold-development', 'erp-mold-development', false\)/i)
    assert.doesNotMatch(moldDevelopmentSql, /values \('erp-mold-development', 'erp-mold-development', true\)/i)
    assert.match(moldDevelopmentSql, /create policy mold_development_files_select[\s\S]*to authenticated/i)
  })

  it('resolves revision approvers on the server instead of accepting a client actor', () => {
    const revision = sqlFunction('transition_mold_revision')
    assert.match(revision, /actor_id\s*:=\s*public\.current_mold_actor_id\(\)/i)
    assert.doesNotMatch(revision, /p_actor_id/i)
  })
})
