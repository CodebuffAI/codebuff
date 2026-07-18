import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createBaseDeep } from '../base2/base-deep'
import { createBase2 } from '../base2/base2'
import { normalizeGateFilePath } from '../base2/gate-paths'
import type { Base2ActiveWorkState } from '../base2/gate-state'

const TEST_TMP_ROOT = join(process.cwd(), '.e2e-scratch', 'base2-gate-tests')
mkdirSync(TEST_TMP_ROOT, { recursive: true })

function makeProjectTempDir(prefix: string): string {
  return mkdtempSync(join(TEST_TMP_ROOT, prefix))
}

function buildContentMarker(absolutePath: string): string {
  const data = readFileSync(absolutePath)
  const hash = createHash('sha256').update(data).digest('hex')
  return `sha256:${hash}:${data.length}`
}

function parseGateStateBlock(text: string):
  | {
      gate: string
      status: string
      details: string
      repairRound?: number
      maxRepairRounds?: number
    }
  | undefined {
  const match = text.match(/<gate-state>([\s\S]*?)<\/gate-state>/)
  if (!match) return undefined
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    return {
      gate: String(parsed.gate ?? ''),
      status: String(parsed.status ?? ''),
      details: String(parsed.details ?? ''),
      ...(typeof parsed.repairRound === 'number'
        ? { repairRound: parsed.repairRound }
        : {}),
      ...(typeof parsed.maxRepairRounds === 'number'
        ? { maxRepairRounds: parsed.maxRepairRounds }
        : {}),
    }
  } catch {
    return undefined
  }
}

function buildFingerprint(
  entries: Array<{ file: string; statusLine: string; contentMarker: string }>,
  validationSummary: string,
): string {
  const sorted = entries
    .map((entry) => ({
      ...entry,
      file: normalizeGateFilePath(entry.file),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))
  const parts = sorted.map(
    (entry) => `${entry.file}\t${entry.statusLine}\t${entry.contentMarker}`,
  )
  const details = `files-v3\n${parts.join('\n')}\n--\n${validationSummary}`
  return `v3:${createHash('sha256').update(details).digest('hex')}`
}

function attestedReviewerResult(
  reviewCall: any,
  verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING' = 'LOOKS_GOOD',
  findings: string[] = [],
) {
  const prompt = String(reviewCall?.input?.agents?.[0]?.prompt ?? '')
  const fingerprint =
    prompt.match(/Snapshot fingerprint \(echo exactly\): ([^\n]+)/)?.[1] ?? ''
  const files =
    prompt
      .match(/Pending changed files: ([^\n]+)/)?.[1]
      ?.split(',')
      .map((file: string) => file.trim())
      .filter((file: string) => file && file !== '(unknown)') ?? []
  return {
    toolResult: [
      {
        type: 'json',
        value: [
          {
            schemaVersion: 1,
            verdict,
            snapshotFingerprint: fingerprint,
            reviewedFiles: files,
            findings,
            coverage: 'covered',
            dimensions: {
              correctness: 'pass',
              security: 'pass',
              tests: 'pass',
              apiCompatibility: 'pass',
              performance: 'pass',
            },
            requirementCoverage: [],
          },
        ],
      },
    ],
  }
}

function completedRepairReceipt(findingIds: string[], files: string[]) {
  return {
    toolResult: [
      {
        type: 'json',
        value: {
          schemaVersion: 1,
          receiptId: 'repair-receipt',
          status: 'completed',
          changedFiles: files.map((path) => ({ path })),
          findingsAddressed: findingIds,
          requestedValidation: [],
        },
      },
    ],
  }
}

function attestedBackgroundReviewerResult(
  agentState: any,
  verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING',
  findings: string[] = [],
) {
  const active = agentState.base2ActiveWork
  const fingerprint = active.validationEvidence?.[0]?.gateId ?? ''
  const reviewedFiles = active.pendingGateFiles ?? []
  return {
    toolResult: {
      result: [
        {
          type: 'json',
          value: [
            {
              schemaVersion: 1,
              verdict,
              snapshotFingerprint: fingerprint,
              reviewedFiles,
              findings,
              coverage: 'covered',
              dimensions: { correctness: 'pass' },
              requirementCoverage: [],
            },
          ],
        },
      ],
    },
  }
}

function buildDurablePassAgentState(tmpFile: string, fingerprint: string) {
  const gateFile = normalizeGateFilePath(tmpFile)
  return {
    agentId: 'base2-custom',
    base2ActiveWork: {
      changedFiles: [gateFile],
      touchedFiles: [gateFile],
      pendingGateFiles: [gateFile],
      currentPhase: 'awaiting_validation',
      latestWorkSummary: '',
      openReviewerBlockers: [],
      lastValidationSummary: 'No configured file-change hooks ran.',
      nextRequiredAction: '',
      lastPinnedStateMessage: '',
      gatePassedFiles: [gateFile],
      gatePassedPendingFiles: [gateFile],
      gatePassedReviewerVerdict: 'LOOKS_GOOD',
      gatePassedValidationSummary: 'No configured file-change hooks ran.',
      gatePassedFingerprint: fingerprint,
    },
  }
}

describe('base2 validation/reviewer coordination prompts', () => {
  test('declares the automatically spawned context pruner for derived agents', () => {
    const executePlan = createBase2('default', { executePlan: true })

    expect(executePlan.spawnableAgents).toContain('context-pruner')
  })

  test('requires joining parallel validation and review before finalizing', () => {
    const base2 = createBase2('default')

    expect(base2.systemPrompt).toContain('Validation/review join discipline')
    expect(base2.systemPrompt).toContain(
      'Do not treat parallel reviewer approval as final approval until validation has completed',
    )
    expect(base2.systemPrompt).toContain(
      'validation failure/timeout blocks completion even if review looks good',
    )
    expect(base2.systemPrompt).toContain(
      'Omit top-level `timeout_seconds` for editor and other productive subagents',
    )
    expect(base2.systemPrompt).toContain(
      'omitted and `-1` mean no wall-clock deadline',
    )
    expect(base2.instructionsPrompt).toContain('compact implementation brief')
    expect(base2.instructionsPrompt).toContain('pass it as the editor prompt')
    expect(base2.instructionsPrompt).toContain(
      'The editor does not inherit parent conversation history',
    )
    expect(base2.instructionsPrompt).not.toContain(
      'expected validation, and key risks',
    )
    expect(base2.systemPrompt).toContain('product, Openbuff')
    expect(base2.systemPrompt).not.toContain('product, Codebuff')
    expect(base2.systemPrompt).toContain(
      'the runtime automatically runs configured validation hooks and a code-reviewer gate',
    )
    expect(base2.systemPrompt).not.toContain(
      '- Spawn a code-reviewer to review the changes after you have implemented the changes.',
    )
    expect(base2.instructionsPrompt).not.toContain(
      'Spawn a code-reviewer to review the changes after you have implemented changes',
    )
    expect(base2.stepPrompt).toContain('independently detect changed files')
    expect(base2.stepPrompt).toContain('implementation-only prompt')
    expect(base2.stepPrompt).toContain(
      'The editor does not inherit parent conversation history',
    )
    expect(base2.stepPrompt).toContain('Do not put validation commands')
    expect(base2.stepPrompt).toContain('parent-only orchestration tasks')
    expect(base2.stepPrompt).toContain(
      'Do not manually spawn code-reviewer for the same edited file set',
    )
    expect(base2.systemPrompt).toContain(
      'Manual code-reviewer use is for pre-edit/advisory review',
    )
    expect(base2.systemPrompt).toContain('Prefer dedicated harness tools')
    expect(base2.systemPrompt).toContain('Validation is dependency-neutral')
    expect(base2.systemPrompt).toContain(
      'Its absence from the root toolset is expected',
    )
    expect(base2.systemPrompt).toContain(
      'Do not delegate work merely to gain access to set_output',
    )
    expect(base2.systemPrompt).toContain(
      'Post-edit reviewer-family specialists are routed automatically',
    )
    expect(base2.systemPrompt).toContain(
      'Do not manually re-spawn them after edits, after compaction',
    )
    expect(base2.systemPrompt).toContain(
      'Repository status is injected automatically by the runtime',
    )
    expect(base2.systemPrompt).toContain(
      'instead of loading the full initial diff into every request',
    )
    expect(base2.systemPrompt).not.toContain('Initial Git Changes')
    expect(base2.spawnableAgentToolMode).toBe('generic')
    expect(base2.toolNames).not.toContain('git_status')
    expect(base2.toolNames).toContain('get_change_review_bundle')
    expect(base2.toolNames).not.toContain('run_file_change_hooks')
    expect(base2.toolNames).not.toContain('inspect_codebase_structure')
    expect(base2.programmaticToolNames).toEqual(
      expect.arrayContaining([
        'git_status',
        'run_file_change_hooks',
        'inspect_codebase_structure',
      ]),
    )
    expect(base2.systemPrompt).toContain('Atomic edit recovery')
    expect(base2.systemPrompt).toContain('do not peel off remembered edits')
    expect(base2.systemPrompt).toContain(
      'treat that exact finding as the controlling next action',
    )
    expect(base2.systemPrompt).toContain(
      'Copy or paraphrase the specific blocker into your todos/progress state',
    )
    expect(base2.systemPrompt).toContain('do not run another review')
    expect(base2.systemPrompt).toContain('Repeated reviewer blocker loop')
    expect(base2.systemPrompt).toContain('the exact blocker-resolution summary')
    expect(base2.instructionsPrompt).toContain(
      'do not substitute basher for git status or file discovery',
    )
    expect(base2.toolNames).toContain('suggest_followups')
    expect(base2.instructionsPrompt).toContain('suggest_followups')
    expect(base2.stepPrompt).toContain('suggest_followups')
    expect(base2.instructionsPrompt).toContain(
      'after the automated validation/reviewer gate has passed',
    )
    expect(base2.instructionsPrompt).toContain(
      'if the suggest_followups tool is available',
    )
    expect(base2.instructionsPrompt).toContain(
      'If suggest_followups is unavailable, still provide the final summary/end normally',
    )
    expect(base2.stepPrompt).toContain('if that tool is available')
    expect(base2.stepPrompt).toContain(
      'If suggest_followups is unavailable, do not let that block the final summary/end',
    )
  })

  test('plan mode requires all durable artifacts for non-trivial plans', () => {
    const base2 = createBase2('default', { planOnly: true })

    expect(base2.instructionsPrompt).toContain(
      'For non-trivial plans, create all four durable artifacts by default',
    )
    expect(base2.instructionsPrompt).toContain(
      'Normal users should not need to explicitly ask for STATUS or LESSONS artifacts',
    )
    expect(base2.stepPrompt).toContain(
      'Preserve short-answer behavior for simple questions',
    )
    expect(base2.stepPrompt).toContain(
      'create or substantially rewrite the four durable plan artifacts',
    )
    expect(base2.stepPrompt).toContain(
      'do not treat STATUS.md or LESSONS.md as optional/as-needed',
    )
  })

  test('base2 exposes update_plan_status alongside create_plan', () => {
    const base2 = createBase2('default')
    expect(base2.toolNames).toContain('create_plan')
    expect(base2.toolNames).toContain('update_plan_status')

    const planBase2 = createBase2('default', { planOnly: true })
    expect(planBase2.toolNames).toContain('update_plan_status')
  })

  test('plan mode exposes broad read-only analysis agents without mutation agents', () => {
    const planBase2 = createBase2('default', { planOnly: true })
    const spawnable = planBase2.spawnableAgents ?? []

    for (const agent of [
      'basher',
      'browser-use',
      'debugger',
      'general-agent',
    ]) {
      expect(spawnable).toContain(agent)
    }
    for (const agent of [
      'dependency-manager',
      'editor',
      'repair-editor',
      'git-committer',
      'doc-writer',
      'test-writer',
      'tmux-cli',
    ]) {
      expect(spawnable).not.toContain(agent)
    }
    expect(planBase2.toolNames).toContain('check_background_agent')
    expect(planBase2.programmaticConfig).toMatchObject({ planOnly: true })
  })

  test('plan mode allows repeated bounded analysis waves', () => {
    const planBase2 = createBase2('default', { planOnly: true })

    expect(planBase2.systemPrompt).toContain('at most **8** agents')
    expect(planBase2.systemPrompt).toContain(
      'split into multiple bounded waves',
    )
    expect(planBase2.instructionsPrompt).toContain(
      'as many analysis subagents as the work requires',
    )
    expect(planBase2.stepPrompt).toContain(
      'Use bounded waves of analysis subagents until coverage is complete',
    )
    expect(planBase2.systemPrompt).not.toContain('at most one bounded batch')
    expect(planBase2.systemPrompt).toContain('Dependency planning')
    expect(planBase2.systemPrompt).toContain('Live visual analysis')
    expect(planBase2.systemPrompt).not.toContain(
      'start any long-running dev server',
    )
    expect(planBase2.systemPrompt).not.toContain('spawn `dependency-manager`')
  })

  test('plan mode prompts explain incremental update_plan_status semantics', () => {
    const base2 = createBase2('default', { planOnly: true })

    expect(base2.instructionsPrompt).toContain('update_plan_status')
    expect(base2.instructionsPrompt).toContain(
      'incremental STATUS.md and LESSONS.md updates',
    )
    expect(base2.instructionsPrompt).toContain(
      'Do not use the write_todos tool in plan mode',
    )
    expect(base2.instructionsPrompt).toContain(
      'create_plan for SPEC.md and PLAN.md',
    )

    expect(base2.stepPrompt).toContain('update_plan_status')
    expect(base2.stepPrompt).toContain(
      'prefer update_plan_status for incremental STATUS.md and LESSONS.md updates',
    )
    expect(base2.stepPrompt).toContain(
      'Do not use the write_todos tool in plan mode',
    )
  })
})

describe('base-deep prompt naming and tool guidance', () => {
  test('uses Openbuff naming and current tool preferences', () => {
    const baseDeep = createBaseDeep()

    expect(baseDeep.systemPrompt).toContain('product, Openbuff')
    expect(baseDeep.systemPrompt).not.toContain('product, Codebuff')
    expect(baseDeep.systemPrompt).not.toContain(
      'directory-lister, glob-matcher',
    )
    expect(baseDeep.systemPrompt).not.toContain(
      'Prefer apply_patch for existing-file edits',
    )
    expect(baseDeep.systemPrompt).toContain(
      'edit_transaction with the narrowest edit type',
    )
    expect(baseDeep.instructionsPrompt).not.toContain(
      'Prefer apply_patch for edits',
    )
    expect(baseDeep.instructionsPrompt).toContain('through edit_transaction')
    expect(baseDeep.instructionsPrompt).toContain(
      'user-visible completion summary',
    )
    expect(baseDeep.instructionsPrompt).toContain('before suggesting followups')
    expect(baseDeep.toolNames).toEqual(
      expect.arrayContaining([
        'read_outline',
        'list_directory',
        'glob',
        'edit_transaction',
      ]),
    )
    expect(baseDeep.toolNames).not.toContain('str_replace')
    expect(baseDeep.toolNames).not.toContain('replace_range')
    expect(baseDeep.toolNames).not.toContain('rewrite_symbol')
    expect(baseDeep.toolNames).not.toContain('write_file')
    expect(baseDeep.toolNames).not.toContain('propose_str_replace')
    expect(baseDeep.programmaticToolNames).toContain('git_status')
  })
})

describe('base-deep gate lifecycle parity with base2', () => {
  test('inherits handleSteps and exposes the gate tools + repair editor', () => {
    const baseDeep = createBaseDeep()

    // base-deep inherits the full validation/reviewer gate lifecycle by
    // composing createBase2. handleSteps is a function reference (not
    // re-serialized), so its gate-state closures are preserved.
    expect(baseDeep.handleSteps).toBeDefined()
    expect(typeof baseDeep.handleSteps).toBe('function')

    // Mutating/control gate tools remain generator-only. The read-only review
    // bundle is also model-visible so the orchestrator can recover a fresh
    // snapshot after compaction without hitting a tool-availability error.
    expect(baseDeep.programmaticToolNames).toEqual(
      expect.arrayContaining(['run_file_change_hooks', 'git_status']),
    )
    expect(baseDeep.toolNames).toEqual(
      expect.arrayContaining([
        'create_plan',
        'update_plan_status',
        'get_change_review_bundle',
      ]),
    )

    // editor is required for the gate repair loop (spawned on validation
    // failure). code-reviewer runs the reviewer half of the gate.
    expect(baseDeep.spawnableAgents).toEqual(
      expect.arrayContaining(['editor', 'code-reviewer']),
    )
  })

  test('handleSteps runs the same validation gate sequence as base2', () => {
    const baseDeep = createBaseDeep()
    // 'base-deep' is not in the fast-skip allowlist (only 'base2-fast' and
    // 'base2-fast-no-validation' skip), so both validation and reviewer
    // gates run — same as base2 default.
    const agentState = { agentId: 'base-deep' }
    const gen = baseDeep.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    // Pre-step: git_status to detect existing changes.
    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    // spawn_agent_inline context-pruner before the first STEP.
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    // After the step produces a file change: git_status → run_file_change_hooks.
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(afterGit.value).toMatchObject({ toolName: 'run_file_change_hooks' })
    // Gate-state tracks the pending file for the validation/reviewer gate.
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      touchedFiles: ['src/a.ts'],
      pendingGateFiles: ['src/a.ts'],
    })
  })
})

describe('base2 conversational fast path', () => {
  test('answers a fresh greeting without injecting git status or running gates', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2' }
    const generator = base2.handleSteps!({
      agentState,
      prompt: 'Hello.',
      params: {},
    } as any)

    expect(generator.next().value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(generator.next({ toolResult: [] } as any).value).toBe('STEP')
    expect(
      generator.next({ stepsComplete: true, toolResult: [] } as any).done,
    ).toBe(true)
  })
})

describe('base2 proactive index lookup', () => {
  test('starts codebase-oriented prompts with query_index', () => {
    const base2 = createBase2('default')
    const generator = base2.handleSteps!({
      prompt: 'Where is authentication configured in this codebase?',
      params: {},
    } as any)

    expect(generator.next().value).toEqual({
      toolName: 'query_index',
      input: {
        query: 'Where is authentication configured in this codebase?',
        limit: 14,
        mode: 'search',
      },
    })
  })

  test('uses explained wider retrieval for broad cross-subsystem audits', () => {
    const base2 = createBase2('default')
    const generator = base2.handleSteps!({
      prompt:
        'Audit context and indexing across the SDK, runtime, CLI, and tests for feature gaps',
      params: {},
    } as any)

    expect(generator.next().value).toEqual({
      toolName: 'inspect_codebase_structure',
      input: {},
    })
    expect(generator.next().value).toEqual({
      toolName: 'list_directory',
      input: { path: '.' },
    })
    expect(generator.next().value).toMatchObject({
      toolName: 'add_message',
      input: {
        content: expect.stringContaining('Production breadth guard'),
      },
    })
    expect(generator.next().value).toMatchObject({
      toolName: 'query_index',
      input: { mode: 'explain', limit: 30 },
    })
  })

  test('does not restart proactive discovery for a continuity-only prompt', () => {
    const base2 = createBase2('default')
    const generator = base2.handleSteps!({
      prompt: 'Continue with the existing implementation',
      params: {},
    } as any)

    expect(generator.next().value).toMatchObject({ toolName: 'git_status' })
  })

  test('does not query_index for generic chat prompts', () => {
    const base2 = createBase2('default')
    const generator = base2.handleSteps!({
      prompt: 'How are you doing today?',
      params: {},
    } as any)

    expect(generator.next().value).toMatchObject({
      toolName: 'git_status',
      input: {},
    })
  })
})

describe('base2 verification and reviewer gates', () => {
  test('serialized handleSteps does not depend on createBase2 closure variables', () => {
    const base2 = createBase2('default')
    const serializedHandleSteps = new Function(
      `return (${base2.handleSteps!.toString()})`,
    )() as NonNullable<typeof base2.handleSteps>
    const gen = serializedHandleSteps({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
  })

  test('failed verification hooks reopen the turn so failures get fixed', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
      config: base2.programmaticConfig,
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(afterGit.value).toMatchObject({ toolName: 'run_file_change_hooks' })

    const afterHooks = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [{ hookName: 'typecheck', exitCode: 1, stderr: 'TS2322' }],
        },
      ],
    } as any)
    expect(afterHooks.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (afterHooks.value as any).input.content as string
    expect(text).toContain('Verification gate')
    const hookFailGate = parseGateStateBlock(text)
    expect(hookFailGate).toMatchObject({
      gate: 'validation',
      status: 'failed',
    })
    expect(hookFailGate!.details).toContain('validation-hook-failures')
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      touchedFiles: ['src/a.ts'],
      pendingGateFiles: ['src/a.ts'],
      nextRequiredAction:
        'Fix the blocking validation hook failures before doing anything else.',
    })
  })

  test('passing verification hooks trigger code review before completion for non-allowlisted default ids', () => {
    const base2 = createBase2('default')
    expect(base2.spawnableAgents).toContain('code-reviewer')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
      config: base2.programmaticConfig,
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(afterGit.value).toMatchObject({ toolName: 'run_file_change_hooks' })
    const afterHooks = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [
            {
              validationStatus: 'hooks_skipped',
              message:
                'Configured file-change hooks were skipped because none matched the changed files.',
              configuredHookCount: 1,
              changedFiles: ['src/a.ts'],
            },
          ],
        },
      ],
    } as any)
    expect(afterHooks.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })
    expect((agentState as any).base2ActiveWork.lastValidationSummary).toBe(
      'REDUCED_ASSURANCE: Configured file-change hooks were skipped because none matched the changed files.',
    )
    const gatePassed = gen.next(attestedReviewerResult(afterHooks.value) as any)
    expect(gatePassed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((gatePassed.value as any).input.content).toMatch(
      /reviewer gate passed with LOOKS_GOOD/i,
    )
    const passGate = parseGateStateBlock(
      (gatePassed.value as any).input.content as string,
    )
    expect(passGate).toMatchObject({
      gate: 'validation/reviewer',
      status: 'passed',
    })
    expect(passGate!.details).toContain('LOOKS_GOOD')
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      touchedFiles: ['src/a.ts'],
      pendingGateFiles: [],
      currentPhase: 'final_response_allowed',
      openReviewerBlockers: [],
      nextRequiredAction: '',
    })
    expect(gen.next().value).toMatchObject({
      toolName: 'git_status',
      input: { include_diff: true },
    })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { status: ' M src/a.ts', diff: 'diff' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({
        toolName: 'add_message',
        input: { role: 'user' },
      })
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(done.done).toBe(true)

    const followupGen = base2.handleSteps!({
      agentState,
      prompt: 'Thanks, finish up.',
      params: {},
    } as any)
    expect(followupGen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      followupGen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const followupStep = followupGen.next()
    expect(followupStep.value).toBe('STEP')
    expect(
      followupGen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const followupDone = followupGen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(followupDone.done).toBe(true)
  })

  test('absolute and relative paths share durable gate-passed state after review', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const cwd = process.cwd().replace(/\\/g, '/')
    const absolutePath = `${cwd}/src/a.ts`
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [
          { type: 'json', value: { file: `file://${absolutePath}` } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/a.ts'] },
    })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    expect(
      gen.next(attestedReviewerResult(reviewCall) as any).value,
    ).toMatchObject({ toolName: 'add_message' })
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      touchedFiles: ['src/a.ts'],
      pendingGateFiles: [],
      gatePassedFiles: ['src/a.ts'],
      currentPhase: 'final_response_allowed',
    })

    expect(gen.next().value).toMatchObject({
      toolName: 'git_status',
      input: { include_diff: true },
    })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { status: ' M src/a.ts', diff: 'diff' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: ` M ${absolutePath}` } }],
    } as any)

    expect(done.done).toBe(true)
  })

  test('structured reviewer approval allows finalization', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const gatePassed = gen.next(attestedReviewerResult(reviewCall) as any)

    expect(gatePassed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((gatePassed.value as any).input.content.toLowerCase()).toContain(
      'reviewer gate passed with looks_good',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      pendingGateFiles: [],
      currentPhase: 'final_response_allowed',
      openReviewerBlockers: [],
      nextRequiredAction: '',
    })
  })

  test('structured reviewer response records durable pass state', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const gatePassed = gen.next(attestedReviewerResult(reviewCall) as any)

    expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
    expect((gatePassed.value as any).input.content).toMatch(
      /reviewer gate passed with LOOKS_GOOD/i,
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      pendingGateFiles: [],
      gatePassedFiles: ['src/a.ts'],
      gatePassedPendingFiles: ['src/a.ts'],
      gatePassedReviewerVerdict: 'LOOKS_GOOD',
      gatePassedValidationSummary: 'No configured file-change hooks ran.',
      currentPhase: 'final_response_allowed',
    })
  })

  test('durable gate pass does not reuse when no fingerprint is recorded (fail closed)', () => {
    const base2 = createBase2('default')
    // Older serialized state without `gatePassedFingerprint`. The harness must
    // fail closed and re-run validation/review instead of reusing the pass
    // purely on file-set match, because a same-path content change between
    // turns would otherwise silently bypass the gate.
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: {
        changedFiles: ['src/a.ts'],
        touchedFiles: ['src/a.ts'],
        pendingGateFiles: ['src/a.ts'],
        currentPhase: 'awaiting_validation',
        latestWorkSummary: '',
        openReviewerBlockers: [],
        lastValidationSummary: 'No configured file-change hooks ran.',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
        gatePassedFiles: ['src/a.ts'],
        gatePassedPendingFiles: ['src/a.ts'],
        gatePassedReviewerVerdict: 'LOOKS_GOOD',
        gatePassedValidationSummary: 'No configured file-change hooks ran.',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Finish the previous response.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const next = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)

    // No fingerprint -> no durable reuse -> validation hooks rerun.
    expect(next.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/a.ts'] },
    })
  })

  test('reuses prior passed conversation gate-state for unchanged pending files', () => {
    const base2 = createBase2('default')
    const tmpDir = makeProjectTempDir('base2-conversation-pass-')
    const fileA = join(tmpDir, 'a.ts')
    const fileB = join(tmpDir, 'b.ts')
    const gateFileA = normalizeGateFilePath(fileA)
    const gateFileB = normalizeGateFilePath(fileB)
    writeFileSync(fileA, 'export const a = 1\n')
    writeFileSync(fileB, 'export const b = 2\n')
    const validationSummary = 'Configured file-change hooks passed: typecheck.'
    const fingerprint = buildFingerprint(
      [
        {
          file: gateFileA,
          statusLine: ` M ${fileA}`,
          contentMarker: buildContentMarker(fileA),
        },
        {
          file: gateFileB,
          statusLine: ` M ${fileB}`,
          contentMarker: buildContentMarker(fileB),
        },
      ],
      validationSummary,
    )
    const passedGateState = `<gate-state>{"gate":"validation/reviewer","status":"passed","details":"reviewer verdict LOOKS_GOOD; validation hooks ran; pending files: ${fileA}, ${fileB}; completed"}</gate-state>`
    const agentState = {
      agentId: 'base2-custom',
      messageHistory: [
        {
          role: 'user',
          content: `Manual/runtime gate passed. ${passedGateState}`,
        },
      ],
      base2ActiveWork: {
        changedFiles: [gateFileA, gateFileB],
        touchedFiles: [gateFileA, gateFileB],
        pendingGateFiles: [gateFileA, gateFileB],
        currentPhase: 'awaiting_validation',
        latestWorkSummary: 'Pending gate already passed manually.',
        openReviewerBlockers: [],
        lastValidationSummary: validationSummary,
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
        gatePassedPendingFiles: [gateFileA, gateFileB],
        gatePassedReviewerVerdict: 'LOOKS_GOOD',
        gatePassedValidationSummary: validationSummary,
        gatePassedFingerprint: fingerprint,
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Finish the previous response.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { status: ` M ${fileA}\n M ${fileB}` } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({ stepsComplete: true, toolResult: [], agentState } as any)
        .value,
    ).toMatchObject({ toolName: 'git_status' })
    const reused = gen.next({
      toolResult: [
        { type: 'json', value: { status: ` M ${fileA}\n M ${fileB}` } },
      ],
    } as any)

    expect(reused.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const content = (reused.value as any).input.content as string
    expect(content).toContain(
      'Previous validation and reviewer gate already passed in this conversation',
    )
    expect(content).toContain('conversation gate-state reuse')
    expect(parseGateStateBlock(content)).toMatchObject({
      gate: 'validation/reviewer',
      status: 'passed',
    })
    expect((agentState as any).base2ActiveWork).toMatchObject({
      pendingGateFiles: [],
      openReviewerBlockers: [],
      nextRequiredAction: '',
      currentPhase: 'final_response_allowed',
      gatePassedFiles: [gateFileA, gateFileB],
      gatePassedPendingFiles: [gateFileA, gateFileB],
      gatePassedReviewerVerdict: 'LOOKS_GOOD',
    })
    expect((agentState as any).canSuggestFollowups).toBe(true)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('does not reuse prior conversation gate-state when local file content changed', () => {
    const base2 = createBase2('default')
    const tmpDir = makeProjectTempDir('base2-stale-conversation-pass-')
    const tmpFile = join(tmpDir, 'a.ts')
    const gateFile = normalizeGateFilePath(tmpFile)
    writeFileSync(tmpFile, 'export const value = 1\n')
    const validationSummary = 'Configured file-change hooks passed: typecheck.'
    const fingerprint = buildFingerprint(
      [
        {
          file: gateFile,
          statusLine: ` M ${tmpFile}`,
          contentMarker: buildContentMarker(tmpFile),
        },
      ],
      validationSummary,
    )
    writeFileSync(tmpFile, 'export const value = 2\n')
    const passedGateState = `<gate-state>{"gate":"validation/reviewer","status":"passed","details":"reviewer verdict LOOKS_GOOD; validation hooks ran; pending files: ${tmpFile}; completed"}</gate-state>`
    const agentState = {
      agentId: 'base2-custom',
      messageHistory: [{ role: 'user', content: passedGateState }],
      base2ActiveWork: {
        changedFiles: [gateFile],
        touchedFiles: [gateFile],
        pendingGateFiles: [gateFile],
        currentPhase: 'awaiting_validation',
        latestWorkSummary: 'Pending gate previously passed.',
        openReviewerBlockers: [],
        lastValidationSummary: validationSummary,
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
        gatePassedPendingFiles: [gateFile],
        gatePassedReviewerVerdict: 'LOOKS_GOOD',
        gatePassedValidationSummary: validationSummary,
        gatePassedFingerprint: fingerprint,
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Finish the previous response.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ` M ${tmpFile}` } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({ stepsComplete: true, toolResult: [], agentState } as any)
        .value,
    ).toMatchObject({ toolName: 'git_status' })
    const next = gen.next({
      toolResult: [{ type: 'json', value: { status: ` M ${tmpFile}` } }],
    } as any)

    expect(next.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: [gateFile] },
    })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('does not reuse prior conversation gate-state after later file-changing messages', () => {
    const base2 = createBase2('default')
    const passedGateState =
      '<gate-state>{"gate":"validation/reviewer","status":"passed","details":"reviewer verdict LOOKS_GOOD; pending files: src/a.ts"}</gate-state>'
    const agentState = {
      agentId: 'base2-custom',
      messageHistory: [
        { role: 'user', content: passedGateState },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'str_replace',
              input: { path: 'src/a.ts', replacements: [] },
            },
          ],
        },
      ],
      base2ActiveWork: {
        changedFiles: ['src/a.ts'],
        touchedFiles: ['src/a.ts'],
        pendingGateFiles: ['src/a.ts'],
        currentPhase: 'awaiting_validation',
        latestWorkSummary: '',
        openReviewerBlockers: [],
        lastValidationSummary: 'No configured file-change hooks ran.',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Finish the previous response.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({ stepsComplete: true, toolResult: [], agentState } as any)
        .value,
    ).toMatchObject({ toolName: 'git_status' })
    const next = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)

    expect(next.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/a.ts'] },
    })
  })

  test('hitStepCap breaks out instead of falling through to the validation/reviewer gate', () => {
    // Regression: when an explicit fixed cap (stepsRemaining === 0) fires, the LLM
    // step returns shouldEndTurn=true. Before the hitStepCap flag was threaded
    // through, base2 fell through to the gate (since `if (!stepsComplete)
    // continue` didn't trigger for stepsComplete=true). The gate would re-yield
    // STEP, which would re-trigger the step-cap (stepsRemaining still 0),
    // causing an infinite loop between the step-cap guard and the reviewer.
    // With hitStepCap, base2 breaks out immediately and finalizes.
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: {
        changedFiles: ['src/a.ts'],
        touchedFiles: ['src/a.ts'],
        pendingGateFiles: ['src/a.ts'],
        currentPhase: 'awaiting_validation',
        latestWorkSummary: '',
        openReviewerBlockers: [],
        lastValidationSummary: 'No configured file-change hooks ran.',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Continue working',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
      expect(gen.next().value).toBe('STEP')
    }

    // The LLM step hit the step-cap: shouldEndTurn=true AND hitStepCap=true.
    const stepResult = gen.next({
      stepsComplete: true,
      hitStepCap: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)

    // The generator must break out (return done) rather than yield the
    // git_status tool call that precedes the gate. If it fell through to the
    // gate, this would be a git_status yield instead of done.
    expect(stepResult.done).toBe(true)
    expect((agentState as any).base2ActiveWork.currentPhase).toBe('blocked')
    expect((agentState as any).base2ActiveWork.nextRequiredAction).toContain(
      'Step cap reached',
    )
    expect((agentState as any).base2ActiveWork.pendingGateFiles).toEqual([
      'src/a.ts',
    ])
    expect((agentState as any).canSuggestFollowups).toBe(false)
  })

  test('historical changed files alone do not trigger stale validation or review', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2',
      base2ActiveWork: {
        changedFiles: ['src/old.ts'],
        touchedFiles: ['src/old.ts'],
        pendingGateFiles: [],
        latestWorkSummary: 'Previous completed work touched: src/old.ts',
        openReviewerBlockers: [],
        lastValidationSummary:
          'Configured file-change hooks passed: typecheck.',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Finish the previous response.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/old.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const finalGate = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/old.ts' } }],
    } as any)
    expect(finalGate.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((finalGate.value as any).input.content).toContain(
      'No edited files were detected.',
    )
    expect(gen.next().value).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/old.ts' } }],
    } as any)
    expect(done.done).toBe(true)
  })

  test('historical changed files gate only newly detected edits', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2',
      base2ActiveWork: {
        changedFiles: ['src/old.ts'],
        touchedFiles: ['src/old.ts'],
        pendingGateFiles: [],
        latestWorkSummary: '',
        openReviewerBlockers: [],
        lastValidationSummary: '',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/old.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/new.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [
        { type: 'json', value: { status: ' M src/old.ts\n M src/new.ts' } },
      ],
    } as any)
    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/new.ts'] },
    })
  })

  test('ignores non-edit tool results with file fields when detecting changes', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/read-only.ts',
              errorMessage: 'read_files failed',
            },
          },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const finalGate = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)
    expect(finalGate.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((finalGate.value as any).input.content).toContain(
      'No edited files were detected.',
    )
    expect(gen.next().value).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(done.done).toBe(true)
  })

  test('ignores unverified legacy edit results with a file and success flag', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/direct-edit.ts',
              success: true,
              message: 'String replace applied successfully.',
            },
          },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((afterGit.value as any).input.content).toContain(
      'No edited files were detected.',
    )
  })

  test('ignores unverified editor changedFiles summaries without mutation receipts', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [
          {
            type: 'json',
            value: { output: { changedFiles: ['src/from-editor.ts'] } },
          },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((afterGit.value as any).input.content).toContain(
      'No edited files were detected.',
    )
  })

  test('direct edit tool calls in message history trigger gates when git status was already dirty', () => {
    const base2 = createBase2('default')
    const initialMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'existing context' }],
    }
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2', messageHistory: [initialMessage] },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { status: ' M src/already-dirty.ts' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    const messageHistory = [
      initialMessage,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'str_replace',
            input: {
              path: 'src/already-dirty.ts',
              replacements: [{ oldString: 'before', newString: 'after' }],
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'tool-call-1',
        toolName: 'str_replace',
        content: [
          {
            type: 'json',
            value: {
              file: 'src/already-dirty.ts',
              message: 'String replace applied successfully.',
            },
          },
        ],
      },
    ]
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [],
        agentState: { messageHistory },
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [
        { type: 'json', value: { status: ' M src/already-dirty.ts' } },
      ],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/already-dirty.ts'] },
    })
    const afterHooks = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any)
    expect(afterHooks.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })
    const gatePassed = gen.next(attestedReviewerResult(afterHooks.value) as any)
    expect(gatePassed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect(gen.next().value).toMatchObject({
      toolName: 'git_status',
      input: { include_diff: true },
    })
    expect(
      gen.next({
        toolResult: [
          {
            type: 'json',
            value: { status: ' M src/already-dirty.ts', diff: 'diff' },
          },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinnedState = gen.next().value
    if (maybePinnedState !== 'STEP') {
      expect(maybePinnedState).toMatchObject({
        toolName: 'add_message',
        input: { role: 'user' },
      })
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [],
        agentState: { messageHistory },
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [
        { type: 'json', value: { status: ' M src/already-dirty.ts' } },
      ],
    } as any)
    expect(done.done).toBe(true)
  })

  test('apply_patch calls in message history trigger gates when git status was already dirty', () => {
    const base2 = createBase2('default')
    const initialMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'existing context' }],
    }
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2', messageHistory: [initialMessage] },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { status: ' M src/already-dirty.ts' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    const messageHistory = [
      initialMessage,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'apply_patch',
            input: {
              operation: {
                type: 'update_file',
                path: 'src/already-dirty.ts',
                diff: '@@\n-before\n+after\n',
              },
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'tool-call-1',
        toolName: 'apply_patch',
        content: [
          {
            type: 'json',
            value: {
              message: 'Patch applied successfully.',
              applied: [{ file: 'src/already-dirty.ts', action: 'update' }],
            },
          },
        ],
      },
    ]
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [],
        agentState: { messageHistory },
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [
        { type: 'json', value: { status: ' M src/already-dirty.ts' } },
      ],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/already-dirty.ts'] },
    })
  })

  test('apply_smart_patch calls in message history trigger gates when git status was already dirty', () => {
    const base2 = createBase2('default')
    const initialMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'existing context' }],
    }
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2', messageHistory: [initialMessage] },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { status: ' M src/already-dirty.ts' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    const messageHistory = [
      initialMessage,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'apply_smart_patch',
            input: {
              path: 'src/already-dirty.ts',
              patch: '@@\n-before\n+after\n',
            },
          },
        ],
      },
    ]
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [],
        agentState: { messageHistory },
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [
        { type: 'json', value: { status: ' M src/already-dirty.ts' } },
      ],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/already-dirty.ts'] },
    })
  })

  test('prior write_todos state in message history is pinned before the next step', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2',
      messageHistory: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'todos-1',
              toolName: 'write_todos',
              input: {
                todos: [
                  { content: 'Gather context', status: 'completed' },
                  {
                    content: 'Implement durable workflow progress',
                    status: 'in_progress',
                  },
                  { content: 'Add focused tests', status: 'pending' },
                ],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'todos-1',
          toolName: 'write_todos',
          content: [{ type: 'json', value: { success: true } }],
        },
      ],
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Continue the implementation.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const pinned = gen.next()

    expect(pinned.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (pinned.value as any).input.content as string
    expect(text).toContain(
      'Workflow todo progress (authoritative resumable state):',
    )
    expect(text).toContain('Completed 1/3.')
    expect(text).toContain(
      'Next workflow action: Implement durable workflow progress',
    )
    expect(text).toContain('do not restart earlier completed workflow steps')
    expect(text).toContain(
      'Mark this item complete with write_todos once it is actually completed',
    )
    expect(text).not.toContain(
      'Mark this item complete with write_todos before advancing',
    )
    expect(text).not.toContain(
      'Next required action: Implement durable workflow progress',
    )
    expect(
      (agentState as any).base2ActiveWork.workflowTodoProgress,
    ).toMatchObject({
      completedCount: 1,
      totalCount: 3,
      nextWorkflowAction: 'Implement durable workflow progress',
    })
    expect(gen.next().value).toBe('STEP')
  })

  test('write_todos after a step advances pinned workflow action without restarting completed work', () => {
    const base2 = createBase2('default')
    const initialMessageHistory = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'todos-1',
            toolName: 'write_todos',
            input: {
              todos: [
                { content: 'Gather context', status: 'completed' },
                {
                  content: 'Implement durable workflow progress',
                  status: 'in_progress',
                },
                { content: 'Add focused tests', status: 'pending' },
              ],
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'todos-1',
        toolName: 'write_todos',
        content: [{ type: 'json', value: { success: true } }],
      },
    ]
    const updatedMessageHistory = [
      ...initialMessageHistory,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'todos-2',
            toolName: 'write_todos',
            input: {
              todos: [
                { content: 'Gather context', status: 'completed' },
                {
                  content: 'Implement durable workflow progress',
                  status: 'completed',
                },
                { content: 'Add focused tests', status: 'in_progress' },
              ],
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'todos-2',
        toolName: 'write_todos',
        content: [{ type: 'json', value: { success: true } }],
      },
    ]
    const agentState = {
      agentId: 'base2',
      messageHistory: initialMessageHistory,
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Continue the implementation.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const initialPinned = gen.next()
    expect((initialPinned.value as any).input.content).toContain(
      'Next workflow action: Implement durable workflow progress',
    )
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: false,
        toolResult: [],
        agentState: { messageHistory: updatedMessageHistory },
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const advancedPinned = gen.next()

    expect(advancedPinned.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (advancedPinned.value as any).input.content as string
    expect(text).toContain('Completed 2/3.')
    expect(text).toContain('Next workflow action: Add focused tests')
    expect(text).toContain('do not restart earlier completed workflow steps')
    expect(text).not.toContain(
      'Next workflow action: Implement durable workflow progress',
    )
    expect(
      (agentState as any).base2ActiveWork.workflowTodoProgress,
    ).toMatchObject({
      completedCount: 2,
      totalCount: 3,
      nextWorkflowAction: 'Add focused tests',
    })
    expect(gen.next().value).toBe('STEP')
  })

  test('direct edit_transaction calls collect all edited paths from message history', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2', messageHistory: [] },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [],
        agentState: {
          messageHistory: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'tool-call-1',
                  toolName: 'edit_transaction',
                  input: {
                    edits: [
                      {
                        type: 'str_replace',
                        path: 'src/one.ts',
                        replacements: [],
                      },
                      {
                        type: 'str_replace',
                        path: 'src/two.ts',
                        replacements: [],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/one.ts', 'src/two.ts'] },
    })
  })

  test('does not treat nested edit-shaped data in non-tool-call messages as direct edits', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2', messageHistory: [] },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [],
        agentState: {
          messageHistory: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    toolName: 'str_replace',
                    input: { path: 'src/not-edited.ts' },
                  }),
                },
              ],
            },
            {
              role: 'tool',
              toolCallId: 'tool-call-1',
              toolName: 'read_files',
              content: [
                {
                  type: 'json',
                  value: {
                    toolName: 'str_replace',
                    input: { path: 'src/not-edited.ts' },
                  },
                },
              ],
            },
          ],
        },
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const finalGate = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)
    expect(finalGate.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((finalGate.value as any).input.content).toContain(
      'No edited files were detected.',
    )
    expect(gen.next().value).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(done.done).toBe(true)
  })

  test('fast/no-validation mode skips file-change hooks and reviewer after edits', () => {
    const base2 = createBase2('fast')
    expect(base2.spawnableAgents).toContain('code-reviewer')
    const agentState = { agentId: 'base2-fast' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const skipDiagnostic = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)

    // Disabled-gate fast path now surfaces a visible skip diagnostic with
    // a parseable gate-state block before terminating the generator.
    expect(skipDiagnostic.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const skipText = (skipDiagnostic.value as any).input.content as string
    expect(skipText).toContain('validation-and-reviewer-gates-disabled')
    const skipGate = parseGateStateBlock(skipText)
    expect(skipGate).toMatchObject({
      gate: 'validation/reviewer',
      status: 'skipped',
    })
    expect(skipGate!.details).toContain(
      'validation-and-reviewer-gates-disabled',
    )

    const done = gen.next()
    expect(done.done).toBe(true)
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      pendingGateFiles: ['src/a.ts'],
      lastReviewerGateSkipReason: 'validation-and-reviewer-gates-disabled',
    })
  })

  test('custom hasNoValidation option skips file-change hooks and reviewer after edits', () => {
    const base2 = createBase2('default', { hasNoValidation: true })
    const agentState = { agentId: 'base2-custom-no-validation' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
      config: base2.programmaticConfig,
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const skipDiagnostic = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)

    expect(skipDiagnostic.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const skipText = (skipDiagnostic.value as any).input.content as string
    expect(skipText).toContain('validation-and-reviewer-gates-disabled')
    const skipGate = parseGateStateBlock(skipText)
    expect(skipGate).toMatchObject({
      gate: 'validation/reviewer',
      status: 'skipped',
    })
    expect(skipGate!.details).toContain(
      'validation-and-reviewer-gates-disabled',
    )

    const done = gen.next()
    expect(done.done).toBe(true)
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      pendingGateFiles: ['src/a.ts'],
      lastReviewerGateSkipReason: 'validation-and-reviewer-gates-disabled',
    })
  })

  test('awaiting validation with changed files but no pending gate files blocks as unsafe', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2',
      base2ActiveWork: {
        changedFiles: ['src/a.ts'],
        touchedFiles: ['src/a.ts'],
        pendingGateFiles: [],
        currentPhase: 'awaiting_validation',
        latestWorkSummary: '',
        openReviewerBlockers: [],
        lastValidationSummary: '',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Finish the previous response.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const maybePinned = gen.next().value
    if (maybePinned !== 'STEP') {
      expect(maybePinned).toMatchObject({ toolName: 'add_message' })
      expect((maybePinned as any).input.content).toContain(
        'Current phase: awaiting_validation',
      )
      expect(gen.next().value).toBe('STEP')
    }
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const blocked = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)

    expect(blocked.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (blocked.value as any).input.content as string
    expect(text).toContain('cannot safely continue')
    expect(text).toContain('edits-detected-without-pending-gate-files')
    expect(text).not.toContain('No edited files were detected.')
    const unsafeGate = parseGateStateBlock(text)
    expect(unsafeGate).toMatchObject({
      gate: 'validation/reviewer',
      status: 'failed',
    })
    expect(unsafeGate!.details).toContain(
      'edits-detected-without-pending-gate-files',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      pendingGateFiles: [],
      currentPhase: 'blocked',
      lastReviewerGateSkipReason: 'edits-detected-without-pending-gate-files',
      nextRequiredAction:
        'Unsafe reviewer gate state: edits were detected without pending gate files. Re-read the edited files/status, make a minimal follow-up edit if needed to restore pending gate files, then finish so validation/review can run safely.',
    })
  })

  test('legacy unresolved reviewer blockers seed pending gate files', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2',
      base2ActiveWork: {
        changedFiles: ['src/legacy.ts'],
        touchedFiles: ['src/legacy.ts'],
        latestWorkSummary:
          'Reviewer feedback is open for pending files: src/legacy.ts',
        openReviewerBlockers: ['BLOCKING: Fix the legacy blocker.'],
        lastValidationSummary: 'No configured file-change hooks ran.',
        nextRequiredAction:
          'Resolve the reviewer feedback below before any unrelated work, final response, or another review.',
        lastPinnedStateMessage: '',
      },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Continue fixing reviewer feedback.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/legacy.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const pinned = gen.next()
    expect(pinned.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (pinned.value as any).input.content as string
    expect(text).toContain('BLOCKING: Fix the legacy blocker.')
    expect(text).toContain(
      'Pending validation/reviewer gate files: src/legacy.ts',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      pendingGateFiles: ['src/legacy.ts'],
      currentPhase: 'blocked',
    })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/legacy.ts' } }],
    } as any)
    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/legacy.ts'] },
    })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: [] }] } as any).value,
    ).toMatchObject({ toolName: 'spawn_agents' })
  })

  test('reviewer feedback is pinned as active work before the next step', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    expect(
      gen.next(
        attestedReviewerResult(reviewCall, 'BLOCKING', [
          'Fix the edge case.',
        ]) as any,
      ).value,
    ).toMatchObject({ toolName: 'add_message' })

    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/a.ts'],
      touchedFiles: ['src/a.ts'],
      pendingGateFiles: ['src/a.ts'],
      openReviewerBlockers: ['BLOCKING: Fix the edge case.'],
      lastValidationSummary: 'No configured file-change hooks ran.',
      nextRequiredAction:
        'Resolve the reviewer feedback below before any unrelated work, final response, or another review.',
    })

    expect(gen.next().value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'repair-editor' }] },
    })
    const findingIds = (
      agentState as any
    ).base2ActiveWork.openReviewerFindings.map((finding: any) => finding.id)
    expect(
      gen.next(completedRepairReceipt(findingIds, ['src/a.ts']) as any).value,
    ).toMatchObject({
      toolName: 'git_status',
    })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    const pinned = gen.next()
    expect(pinned.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (pinned.value as any).input.content as string
    expect(text).toContain(
      'Harness pinned active-work state (controlling state',
    )
    expect(text).toContain('Current phase: awaiting_validation')
    expect(text).toContain('BLOCKING: Fix the edge case.')
    expect(text).toContain('Pending validation/reviewer gate files: src/a.ts')
    expect(text).toContain(
      'Last validation summary: No configured file-change hooks ran.',
    )
    expect(text).toContain(
      'Next required action: Repair-editor must address every open reviewer finding',
    )
    expect(text).not.toContain('Historical changed files: src/a.ts')
    expect(text).not.toContain('Historical touched files: src/a.ts')
    expect(gen.next().value).toBe('STEP')
  })

  test('blocking reviewer feedback reopens the turn', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const afterReview = gen.next(
      attestedReviewerResult(reviewCall, 'BLOCKING', [
        'Fix the edge case.',
      ]) as any,
    )

    expect(afterReview.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((afterReview.value as any).input.content).toContain('Reviewer gate')
    expect((afterReview.value as any).input.content).toContain(
      'BLOCKING: Fix the edge case.',
    )
  })

  test('durable gate pass is NOT reused when working-tree content hash differs', () => {
    // Set up a real on-disk file so the fingerprint can encode a stable
    // content hash. The recorded fingerprint pretends the file previously
    // hashed to a different content marker; the harness must rebuild the
    // fingerprint from the current file bytes and detect the mismatch.
    const tmpDir = makeProjectTempDir('base2-gate-mismatch-')
    const tmpFile = join(tmpDir, 'a.ts')
    try {
      writeFileSync(tmpFile, 'export const x = 1\n')
      const statusLine = ` M ${tmpFile}`
      const stalePreviousFingerprint = buildFingerprint(
        [
          {
            file: tmpFile,
            statusLine,
            // Pretend the file used to hash differently. Real current content
            // hash will be computed by the harness against the live bytes.
            contentMarker:
              'sha256:0000000000000000000000000000000000000000000000000000000000000000:1',
          },
        ],
        'No configured file-change hooks ran.',
      )

      const base2 = createBase2('default')
      const agentState = buildDurablePassAgentState(
        tmpFile,
        stalePreviousFingerprint,
      )
      const gen = base2.handleSteps!({
        agentState,
        prompt: 'Finish the previous response.',
        params: {},
      } as any)

      expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
      expect(
        gen.next({
          toolResult: [{ type: 'json', value: { status: statusLine } }],
        } as any).value,
      ).toMatchObject({ toolName: 'spawn_agent_inline' })
      const maybePinnedState = gen.next().value
      if (maybePinnedState !== 'STEP') {
        expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
        expect(gen.next().value).toBe('STEP')
      }
      expect(
        gen.next({ stepsComplete: true, toolResult: [] } as any).value,
      ).toMatchObject({ toolName: 'git_status' })
      const next = gen.next({
        toolResult: [{ type: 'json', value: { status: statusLine } }],
      } as any)

      // Content hash differs from the stored marker -> no durable reuse.
      expect(next.value).toMatchObject({
        toolName: 'run_file_change_hooks',
        input: { files: [normalizeGateFilePath(tmpFile)] },
      })
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('durable gate pass IS reused when working-tree content hash matches', () => {
    const tmpDir = makeProjectTempDir('base2-gate-reuse-')
    const tmpFile = join(tmpDir, 'a.ts')
    try {
      writeFileSync(tmpFile, 'export const x = 1\n')
      const statusLine = ` M ${tmpFile}`
      const fingerprint = buildFingerprint(
        [
          {
            file: tmpFile,
            statusLine,
            contentMarker: buildContentMarker(tmpFile),
          },
        ],
        'No configured file-change hooks ran.',
      )

      const base2 = createBase2('default')
      const agentState = buildDurablePassAgentState(tmpFile, fingerprint)
      const gen = base2.handleSteps!({
        agentState,
        prompt: 'Finish the previous response.',
        params: {},
      } as any)

      expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
      expect(
        gen.next({
          toolResult: [{ type: 'json', value: { status: statusLine } }],
        } as any).value,
      ).toMatchObject({ toolName: 'spawn_agent_inline' })
      const maybePinnedState = gen.next().value
      if (maybePinnedState !== 'STEP') {
        expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
        expect(gen.next().value).toBe('STEP')
      }
      expect(
        gen.next({ stepsComplete: true, toolResult: [] } as any).value,
      ).toMatchObject({ toolName: 'git_status' })
      const gatePassed = gen.next({
        toolResult: [{ type: 'json', value: { status: statusLine } }],
      } as any)

      // Same fingerprint (including content hash) -> durable reuse fires.
      expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
      const reuseText = (gatePassed.value as any).input.content as string
      expect(reuseText).toContain(
        'Previous validation and reviewer gate already passed with LOOKS_GOOD',
      )
      const reuseGate = parseGateStateBlock(reuseText)
      expect(reuseGate).toMatchObject({
        gate: 'validation/reviewer',
        status: 'passed',
      })
      expect(reuseGate!.details).toContain('durable')
      expect(reuseGate!.details).toContain('LOOKS_GOOD')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('durable gate pass is invalidated when same-path file content changes between turns', () => {
    const tmpDir = makeProjectTempDir('base2-gate-content-change-')
    const tmpFile = join(tmpDir, 'a.ts')
    try {
      writeFileSync(tmpFile, 'export const x = 1\n')
      const statusLine = ` M ${tmpFile}`
      const originalFingerprint = buildFingerprint(
        [
          {
            file: tmpFile,
            statusLine,
            contentMarker: buildContentMarker(tmpFile),
          },
        ],
        'No configured file-change hooks ran.',
      )
      // Same path, but content changed after the gate passed. The git status
      // line stays the same so a status-line-only fingerprint would still
      // match — only the content hash detects this drift.
      writeFileSync(tmpFile, 'export const x = 2\n')

      const base2 = createBase2('default')
      const agentState = buildDurablePassAgentState(
        tmpFile,
        originalFingerprint,
      )
      const gen = base2.handleSteps!({
        agentState,
        prompt: 'Finish the previous response.',
        params: {},
      } as any)

      expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
      expect(
        gen.next({
          toolResult: [{ type: 'json', value: { status: statusLine } }],
        } as any).value,
      ).toMatchObject({ toolName: 'spawn_agent_inline' })
      const maybePinnedState = gen.next().value
      if (maybePinnedState !== 'STEP') {
        expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
        expect(gen.next().value).toBe('STEP')
      }
      expect(
        gen.next({ stepsComplete: true, toolResult: [] } as any).value,
      ).toMatchObject({ toolName: 'git_status' })
      const next = gen.next({
        toolResult: [{ type: 'json', value: { status: statusLine } }],
      } as any)

      // Content changed -> fingerprint differs -> validation reruns.
      expect(next.value).toMatchObject({
        toolName: 'run_file_change_hooks',
        input: { files: [normalizeGateFilePath(tmpFile)] },
      })
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('durable gate pass is NOT reused when previously-hashed file is now missing', () => {
    const tmpDir = makeProjectTempDir('base2-gate-missing-')
    const tmpFile = join(tmpDir, 'a.ts')
    try {
      writeFileSync(tmpFile, 'export const x = 1\n')
      const statusLine = ` M ${tmpFile}`
      const originalFingerprint = buildFingerprint(
        [
          {
            file: tmpFile,
            statusLine,
            contentMarker: buildContentMarker(tmpFile),
          },
        ],
        'No configured file-change hooks ran.',
      )
      // Delete the file before the next turn. The harness must treat the
      // resulting `missing` marker as a mismatch and rerun the gate rather
      // than silently reusing the prior pass.
      rmSync(tmpFile, { force: true })

      const base2 = createBase2('default')
      const agentState = buildDurablePassAgentState(
        tmpFile,
        originalFingerprint,
      )
      const gen = base2.handleSteps!({
        agentState,
        prompt: 'Finish the previous response.',
        params: {},
      } as any)

      expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
      expect(
        gen.next({
          toolResult: [{ type: 'json', value: { status: statusLine } }],
        } as any).value,
      ).toMatchObject({ toolName: 'spawn_agent_inline' })
      const maybePinnedState = gen.next().value
      if (maybePinnedState !== 'STEP') {
        expect(maybePinnedState).toMatchObject({ toolName: 'add_message' })
        expect(gen.next().value).toBe('STEP')
      }
      expect(
        gen.next({ stepsComplete: true, toolResult: [] } as any).value,
      ).toMatchObject({ toolName: 'git_status' })
      const next = gen.next({
        toolResult: [{ type: 'json', value: { status: statusLine } }],
      } as any)

      // Missing-now file -> fingerprint mismatches recorded content hash.
      expect(next.value).toMatchObject({
        toolName: 'run_file_change_hooks',
        input: { files: [normalizeGateFilePath(tmpFile)] },
      })
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('structured BLOCKING reviewer JSON output reopens the turn', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const afterReview = gen.next(
      attestedReviewerResult(reviewCall, 'BLOCKING', [
        'Fix the structured edge case.',
      ]) as any,
    )

    expect(afterReview.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (afterReview.value as any).input.content as string
    expect(text).toContain('Reviewer gate')
    expect(text).toContain('BLOCKING: Fix the structured edge case.')
  })

  test('structured LOOKS_GOOD reviewer JSON output finalizes', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const gatePassed = gen.next(attestedReviewerResult(reviewCall) as any)

    expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
    expect((gatePassed.value as any).input.content.toLowerCase()).toContain(
      'reviewer gate passed with looks_good',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      gatePassedReviewerVerdict: 'LOOKS_GOOD',
    })
  })

  test('reviewer attestation errors retry the reviewer once without spawning repair-editor', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value as any
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const reviewPrompt = reviewCall.input.agents[0].prompt as string
    const snapshotFingerprint = reviewPrompt
      .split('Snapshot fingerprint (echo exactly): ')[1]
      .split('\n')[0]

    const retryCall = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [
            {
              schemaVersion: 1,
              verdict: 'LOOKS_GOOD',
              snapshotFingerprint: 'v2',
              reviewedFiles: ['src/tests/a.ts'],
              findings: [],
              coverage: 'covered',
              dimensions: {},
              requirementCoverage: [],
            },
          ],
        },
      ],
    } as any).value as any
    expect(retryCall).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })
    expect(retryCall.input.agents[0].prompt).toContain(
      'failed the reviewer protocol contract',
    )
    expect(retryCall.input.agents[0].prompt).toContain(
      'do not ask repair-editor to change source code',
    )

    const gatePassed = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [
            {
              schemaVersion: 1,
              verdict: 'LOOKS_GOOD',
              snapshotFingerprint,
              reviewedFiles: ['./src/a.ts'],
              findings: [],
              coverage: 'covered',
              dimensions: {},
              requirementCoverage: [],
            },
          ],
        },
      ],
    } as any)
    expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
    expect((gatePassed.value as any).input.content).toContain(
      'Reviewer gate passed with LOOKS_GOOD',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      reviewerProtocolRetryCount: 0,
    })
  })

  test('repeated reviewer attestation errors stop after the bounded retry', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: [] }] } as any).value,
    ).toMatchObject({ toolName: 'spawn_agents' })

    const invalidAttestation = {
      toolResult: [
        {
          type: 'json',
          value: [
            {
              schemaVersion: 1,
              verdict: 'LOOKS_GOOD',
              snapshotFingerprint: 'wrong',
              reviewedFiles: [],
              findings: [],
              coverage: 'covered',
              dimensions: {},
              requirementCoverage: [],
            },
          ],
        },
      ],
    }
    expect(gen.next(invalidAttestation as any).value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })
    const stopped = gen.next(invalidAttestation as any)
    expect(stopped.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((stopped.value as any).input.content).toContain(
      'failed snapshot/file attestation twice',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'blocked',
      reviewerProtocolRetryCount: 1,
      lastReviewerGateSkipReason: 'reviewer-protocol-attestation-failed',
      openReviewerFindings: [],
    })
    expect(gen.next().done).toBe(true)
  })

  test('structured NON_BLOCKING reviewer JSON output finalizes', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value as any
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const reviewPrompt = reviewCall.input.agents[0].prompt as string
    const snapshotFingerprint = reviewPrompt
      .split('Snapshot fingerprint (echo exactly): ')[1]
      .split('\n')[0]
    expect(snapshotFingerprint).toMatch(/^v3:[0-9a-f]{64}$/)
    expect(reviewPrompt).toContain(
      'Snapshot details (read for file membership; do not echo):',
    )
    const gatePassed = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [
            {
              schemaVersion: 3,
              verdict: 'NON_BLOCKING',
              snapshotFingerprint,
              reviewedFiles: ['src/a.ts'],
              coverage: 'covered',
              dimensions: { correctness: 'pass' },
              findings: [
                {
                  id: 'code-reviewer:correctness:minor-style',
                  summary: 'Minor style suggestion.',
                  severity: 'low',
                  dimension: 'correctness',
                  evidence: ['src/a.ts uses the expected behavior.'],
                  correction: 'Optional naming cleanup.',
                },
              ],
              requirementCoverage: [
                {
                  requirement: 'Requested behavior',
                  status: 'satisfied',
                  evidence: ['src/a.ts'],
                },
              ],
            },
          ],
        },
      ],
    } as any)

    expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
    expect((gatePassed.value as any).input.content).toContain(
      'Reviewer gate passed with NON_BLOCKING',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      gatePassedReviewerVerdict: 'NON_BLOCKING',
    })
    expect((agentState as any).base2ActiveWork.reviewReceipts).toEqual([
      expect.objectContaining({
        reviewer: 'code-reviewer',
        verdict: 'NON_BLOCKING',
        snapshotFingerprint,
        reviewedFiles: ['src/a.ts'],
        findings: [
          expect.objectContaining({
            id: 'code-reviewer:correctness:minor-style',
            evidence: ['src/a.ts uses the expected behavior.'],
          }),
        ],
        requirementCoverage: [
          expect.objectContaining({
            requirement: 'Requested behavior',
            evidence: ['src/a.ts'],
          }),
        ],
      }),
    ])
  })

  test('bounds durable review receipts by total serialized size', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value as any
    const snapshotFingerprint = (reviewCall.input.agents[0].prompt as string)
      .split('Snapshot fingerprint (echo exactly): ')[1]
      .split('\n')[0]
    const longText = 'receipt detail '.repeat(300)

    const gatePassed = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [
            {
              schemaVersion: 3,
              verdict: 'NON_BLOCKING',
              snapshotFingerprint,
              reviewedFiles: ['src/a.ts'],
              coverage: 'covered',
              dimensions: { correctness: 'pass' },
              findings: Array.from({ length: 20 }, (_, index) => ({
                id: `code-reviewer:correctness:finding-${index}`,
                summary: longText,
                severity: 'low',
                dimension: 'correctness',
                evidence: Array.from({ length: 8 }, () => longText),
                correction: longText,
              })),
              requirementCoverage: Array.from({ length: 100 }, (_, index) => ({
                requirement: `Requirement ${index}: ${longText}`,
                status: 'satisfied',
                evidence: Array.from({ length: 8 }, () => longText),
              })),
            },
          ],
        },
      ],
    } as any)

    expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
    const receipt = (agentState as any).base2ActiveWork.reviewReceipts[0]
    expect(JSON.stringify(receipt).length).toBeLessThanOrEqual(4_000)
    expect(receipt).toMatchObject({
      findingCount: 20,
      requirementCoverageCount: 100,
      receiptTruncated: true,
    })
  })

  test('execute-plan prompts use injected artifacts without repeated unchanged reads', () => {
    const base2 = createBase2('default', { executePlan: true })

    expect(base2.instructionsPrompt).toContain(
      'artifact contents already provided in the conversation as the initial authoritative context',
    )
    expect(base2.instructionsPrompt).toContain(
      'read artifacts directly only when their contents are missing, truncated, stale, or have changed',
    )
    expect(base2.stepPrompt).toContain(
      'Use any artifact contents already present in the conversation as the initial source of truth',
    )
    expect(base2.stepPrompt).toContain(
      'read artifacts directly only when contents are missing, truncated, stale, or have changed',
    )
    expect(base2.stepPrompt).toContain(
      'Do not repeatedly re-read unchanged artifacts or source files after confirming the next item',
    )
    expect(base2.stepPrompt).toContain(
      'you may edit project source files to complete planned tasks',
    )
    expect(base2.stepPrompt).not.toContain(
      'Read STATUS.md and PLAN.md before acting',
    )
    for (const tool of ['edit_transaction', 'run_terminal_command'] as const) {
      expect(base2.toolNames).toContain(tool)
    }
    for (const tool of [
      'str_replace',
      'write_file',
      'apply_patch',
      'replace_range',
      'rewrite_symbol',
    ] as const) {
      expect(base2.toolNames).not.toContain(tool)
    }
    expect(base2.toolNames).not.toContain('propose_str_replace')
    expect(base2.toolNames).not.toContain('apply_proposal')
  })

  test('editor handoff guidance includes the standardized envelope fields', () => {
    const base2 = createBase2('default')
    for (const field of [
      'Requirements:',
      'Target files:',
      'Constraints/non-goals:',
      'Patterns:',
      'Risks:',
    ]) {
      expect(base2.instructionsPrompt).toContain(field)
    }
    // Step prompt should also use the envelope field names so the editor can
    // scan them as a checklist.
    for (const field of [
      'Requirements',
      'Target files',
      'Constraints/non-goals',
      'Patterns',
      'Risks',
    ]) {
      expect(base2.stepPrompt).toContain(field)
    }
  })

  test('non-blocking reviewer feedback allows finalization without controlling active work', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const reviewCall = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any).value
    expect(reviewCall).toMatchObject({ toolName: 'spawn_agents' })
    const afterReview = gen.next(
      attestedReviewerResult(reviewCall, 'NON_BLOCKING', [
        'Improve naming.',
      ]) as any,
    )

    expect(afterReview.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((afterReview.value as any).input.content).toContain(
      'Reviewer gate passed with NON_BLOCKING',
    )
    expect((afterReview.value as any).input.content).not.toContain(
      'passed with LOOKS_GOOD',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      pendingGateFiles: [],
      openReviewerBlockers: [],
      nextRequiredAction: '',
    })
  })
})

describe('base2 static-review-only concurrency (M3.1)', () => {
  test('default path (staticReviewOnly absent) does not spawn the reviewer in the background', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    // No background reviewer: validation runs first (foreground), exactly as
    // the existing sequential behavior.
    expect(afterGit.value).toMatchObject({ toolName: 'run_file_change_hooks' })
    expect(
      (agentState as any).base2ActiveWork.staticReviewerJobId,
    ).toBeUndefined()
  })

  test('staticReviewOnly spawns the reviewer in the background before validation and stashes jobId', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: { staticReviewOnly: true },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const bgSpawn = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    // Reviewer spawned in the background BEFORE validation hooks run.
    expect(bgSpawn.value).toMatchObject({ toolName: 'spawn_agents' })
    const agents = (bgSpawn.value as any).input.agents as any[]
    expect(agents[0].agent_type).toBe('code-reviewer')
    expect(agents[0].background).toBe(true)
    expect(agents[0].prompt as string).toContain(
      'Reviewer running concurrently with validation (static-review-only mode).',
    )

    const afterReport = gen.next({
      toolResult: [
        {
          type: 'json',
          value: {
            background: true,
            jobId: 'bg-reviewer-1',
            message: 'Reviewer running in the background.',
          },
        },
      ],
    } as any)
    expect((afterReport.value as any).toolName).toBe('run_file_change_hooks')
    expect((agentState as any).base2ActiveWork.staticReviewerJobId).toBe(
      'bg-reviewer-1',
    )
  })

  test('staticReviewOnly: validation failure does not consult the background reviewer', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: { staticReviewOnly: true },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const bgSpawn = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(bgSpawn.value).toMatchObject({ toolName: 'spawn_agents' })

    const afterReport = gen.next({
      toolResult: [
        {
          type: 'json',
          value: { background: true, jobId: 'bg-reviewer-2', message: 'ok' },
        },
      ],
    } as any)
    expect((afterReport.value as any).toolName).toBe('run_file_change_hooks')
    expect((agentState as any).base2ActiveWork.staticReviewerJobId).toBe(
      'bg-reviewer-2',
    )

    // Validation fails (unparseable failure -> blocked, no repair loop).
    const afterHooks = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [{ hookName: 'typecheck', exitCode: 1, stderr: 'boom' }],
        },
      ],
    } as any)
    // Validation failure cancels speculative review before surfacing the
    // blocking validation diagnostics.
    expect((afterHooks.value as any).toolName).toBe('check_background_agent')
    expect((afterHooks.value as any).input).toMatchObject({
      jobId: 'bg-reviewer-2',
      cancel: true,
    })
    const blocked = gen.next({ toolResult: [] } as any)
    expect((blocked.value as any).toolName).toBe('add_message')
    const text = (blocked.value as any).input.content as string
    expect(text).toContain('Verification gate')
    expect(
      (agentState as any).base2ActiveWork.staticReviewerJobId,
    ).toBeUndefined()
  })

  test('staticReviewOnly: validation pass joins the background reviewer via check_background_agent', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: { staticReviewOnly: true },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const bgSpawn = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(bgSpawn.value).toMatchObject({ toolName: 'spawn_agents' })
    expect((bgSpawn.value as any).input.agents[0].background).toBe(true)

    const afterReport = gen.next({
      toolResult: [
        {
          type: 'json',
          value: { background: true, jobId: 'bg-reviewer-3', message: 'ok' },
        },
      ],
    } as any)
    expect((afterReport.value as any).toolName).toBe('run_file_change_hooks')
    expect((agentState as any).base2ActiveWork.staticReviewerJobId).toBe(
      'bg-reviewer-3',
    )

    // Validation passes (hooks skipped).
    const afterHooks = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [
            {
              validationStatus: 'hooks_skipped',
              message:
                'Configured file-change hooks were skipped because none matched the changed files.',
              configuredHookCount: 1,
              changedFiles: ['src/a.ts'],
            },
          ],
        },
      ],
    } as any)
    // Join the background reviewer instead of a foreground spawn_agents, using
    // the stashed jobId.
    expect(afterHooks.value).toMatchObject({
      toolName: 'check_background_agent',
    })
    expect((afterHooks.value as any).input).toMatchObject({
      jobId: 'bg-reviewer-3',
      timeout_seconds: 120,
    })
    expect((afterHooks.value as any).input).not.toHaveProperty('wait_for')

    // The reviewer returns LOOKS_GOOD via the background result; feed it through
    // the existing collectReviewerBlockers / getReviewerFinalizationVerdict
    // path (unchanged) to reach finalization.
    const gatePassed = gen.next(
      attestedBackgroundReviewerResult(agentState, 'LOOKS_GOOD') as any,
    )
    expect(gatePassed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((gatePassed.value as any).input.content.toLowerCase()).toContain(
      'reviewer gate passed with looks_good',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      pendingGateFiles: [],
      gatePassedReviewerVerdict: 'LOOKS_GOOD',
      staticReviewerJobId: undefined,
    })
  })

  test('staticReviewOnly: background reviewer NON_BLOCKING result finalizes after validation pass', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: { staticReviewOnly: true },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agents' })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { background: true, jobId: 'bg-reviewer-4' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const afterHooks = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any)

    expect(afterHooks.value).toMatchObject({
      toolName: 'check_background_agent',
      input: { jobId: 'bg-reviewer-4', timeout_seconds: 120 },
    })
    expect((afterHooks.value as any).input).not.toHaveProperty('wait_for')

    const gatePassed = gen.next(
      attestedBackgroundReviewerResult(agentState, 'NON_BLOCKING', [
        'Minor suggestion.',
      ]) as any,
    )
    expect(gatePassed.value).toMatchObject({ toolName: 'add_message' })
    expect((gatePassed.value as any).input.content).toContain(
      'Reviewer gate passed with NON_BLOCKING',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      pendingGateFiles: [],
      gatePassedReviewerVerdict: 'NON_BLOCKING',
      staticReviewerJobId: undefined,
    })
  })

  test('staticReviewOnly: background reviewer BLOCKING result reopens the turn after validation pass', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: { staticReviewOnly: true },
    }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'spawn_agents' })
    expect(
      gen.next({
        toolResult: [
          { type: 'json', value: { background: true, jobId: 'bg-reviewer-5' } },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    const afterHooks = gen.next({
      toolResult: [{ type: 'json', value: [] }],
    } as any)

    expect(afterHooks.value).toMatchObject({
      toolName: 'check_background_agent',
      input: { jobId: 'bg-reviewer-5', timeout_seconds: 120 },
    })
    expect((afterHooks.value as any).input).not.toHaveProperty('wait_for')

    const afterReview = gen.next(
      attestedBackgroundReviewerResult(agentState, 'BLOCKING', [
        'Fix the static path.',
      ]) as any,
    )
    expect(afterReview.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((afterReview.value as any).input.content).toContain(
      'BLOCKING: Fix the static path.',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'blocked',
      pendingGateFiles: ['src/a.ts'],
      openReviewerBlockers: ['BLOCKING: Fix the static path.'],
      nextRequiredAction:
        'Resolve the reviewer feedback below before any unrelated work, final response, or another review.',
    })
  })
})

describe('base2 static-review-only gate state (M3.1 unit tests)', () => {
  test('staticReviewOnly defaults to false and is absent from emitted prompts', () => {
    const base2 = createBase2('default')
    // With no activeWorkState supplied, the default gate path must not
    // surface the static-review-only fields in any emitted prompt.
    expect(base2.systemPrompt).not.toContain('staticReviewOnly')
    expect(base2.systemPrompt).not.toContain('staticReviewerJobId')
    expect(base2.instructionsPrompt).not.toContain('staticReviewOnly')
    expect(base2.instructionsPrompt).not.toContain('staticReviewerJobId')
    expect(base2.stepPrompt).not.toContain('staticReviewOnly')
    expect(base2.stepPrompt).not.toContain('staticReviewerJobId')
  })

  test('staticReviewOnly flag is surfaced on the active work state type', () => {
    // Conditional types resolve at compile time; the asserts below fail to
    // typecheck (build error) if the field is absent from the type, while the
    // runtime assertion confirms the resolved literal is `true`.
    type IsStaticReviewOnlyPresent = Base2ActiveWorkState extends {
      staticReviewOnly?: boolean
    }
      ? true
      : false
    type IsStaticReviewerJobIdPresent = Base2ActiveWorkState extends {
      staticReviewerJobId?: string
    }
      ? true
      : false
    const staticReviewOnlyPresent: IsStaticReviewOnlyPresent = true
    const staticReviewerJobIdPresent: IsStaticReviewerJobIdPresent = true
    expect(staticReviewOnlyPresent).toBe(true)
    expect(staticReviewerJobIdPresent).toBe(true)
  })

  test('gate-state type round-trips staticReviewerJobId through JSON', () => {
    const state: Base2ActiveWorkState = {
      pendingGateFiles: ['src/a.ts'],
      gatePassedFiles: [],
      gatePassedPendingFiles: [],
      gatePassedReviewerVerdict: '',
      gatePassedValidationSummary: '',
      gatePassedFingerprint: '',
      lastReviewerGateSkipReason: '',
      touchedFiles: ['src/a.ts'],
      changedFiles: ['src/a.ts'],
      currentPhase: 'awaiting_validation',
      latestWorkSummary: '',
      openReviewerBlockers: [],
      lastValidationSummary: '',
      nextRequiredAction: '',
      lastPinnedStateMessage: '',
      staticReviewOnly: true,
      staticReviewerJobId: 'job-123',
    }
    const roundTripped = JSON.parse(
      JSON.stringify(state),
    ) as Base2ActiveWorkState
    expect(roundTripped.staticReviewOnly).toBe(true)
    expect(roundTripped.staticReviewerJobId).toBe('job-123')
  })
})

describe('base2 repair-loop gate-state telemetry (M6.4)', () => {
  test('repair-incomplete gate-state block surfaces repairRound and maxRepairRounds', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    // Pre-step git_status (no pre-existing changes).
    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')

    // Step completes; the post-step git_status reports a pending change.
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })

    // Validation fails with a parseable (tsc-shaped) failure -> repair loop.
    const typecheckFailure = {
      type: 'json',
      value: [
        {
          hookName: 'typecheck',
          exitCode: 1,
          stderr: 'src/a.ts(1,1): error TS1234: type error',
        },
      ],
    }
    const repairSpawn = gen.next({
      toolResult: [typecheckFailure],
    } as any).value as any
    expect(repairSpawn).toMatchObject({ toolName: 'spawn_agents' })
    expect(
      repairSpawn.input.agents[0].handoff.permissions.readablePaths,
    ).toEqual(['*', '**/*'])
    expect(
      repairSpawn.input.agents[0].handoff.permissions.writablePaths,
    ).toEqual(['src/a.ts'])
    // Repair editor ran; git_status after the repair editor.
    expect(
      gen.next(completedRepairReceipt(['VF-1'], ['src/a.ts']) as any).value,
    ).toMatchObject({
      toolName: 'git_status',
    })
    // Re-verify hooks run after the repair editor.
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })

    // Re-verify still fails -> the repair-incomplete blocked path emits the
    // gate-state block carrying structured repair-loop progress.
    const blocked = gen.next({ toolResult: [typecheckFailure] } as any)
    expect((blocked.value as any).toolName).toBe('add_message')
    const content = (blocked.value as any).input.content as string
    const parsed = parseGateStateBlock(content)

    expect(parsed).toBeDefined()
    expect(parsed!.gate).toBe('validation')
    expect(parsed!.status).toBe('failed')
    expect(parsed!.repairRound).toBeGreaterThanOrEqual(1)
    expect(parsed!.repairRound).toBe(1)
    expect(parsed!.maxRepairRounds).toBe(3)
    expect(parsed!.details).toContain('repair-incomplete')
    expect(parsed!.details).toContain('round 1/3')
  })

  test('non-repair gate-state blocks omit repairRound/maxRepairRounds for backward compatibility', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({ stepsComplete: true, toolResult: [] } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    // No edits: validation hooks are skipped, the reviewer gate does not run,
    // and the finalization block stays the legacy {gate,status,details} shape.
    const finalized = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)
    expect((finalized.value as any).toolName).toBe('add_message')
    const content = (finalized.value as any).input.content as string
    const parsed = parseGateStateBlock(content)

    expect(parsed).toBeDefined()
    expect(parsed!.gate).toBe('validation/reviewer')
    expect(parsed!.status).toBe('passed')
    expect(parsed!.repairRound).toBeUndefined()
    expect(parsed!.maxRepairRounds).toBeUndefined()
  })
})
