import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createBase2 } from '../base2/base2'

function parseGateStateBlock(text: string): {
  gate: string
  status: string
  details: string
} {
  const match = text.match(/<gate-state>([\s\S]*?)<\/gate-state>/)
  expect(match).not.toBeNull()
  return JSON.parse(match![1]) as {
    gate: string
    status: string
    details: string
  }
}

function feedJson(value: unknown) {
  return { toolResult: [{ type: 'json', value }] } as any
}

function finishStepWithToolResult(value: unknown) {
  return {
    stepsComplete: true,
    toolResult: [{ type: 'json', value }],
  } as any
}

const SCRATCH_ROOT = '.e2e-scratch/base2-gate-lifecycle'
const LIFECYCLE_FILE = `${SCRATCH_ROOT}/lifecycle.ts`

afterEach(() => {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true })
})

function reviewerFingerprintFromSpawn(value: any): string {
  const prompt = value?.input?.agents?.[0]?.prompt
  expect(typeof prompt).toBe('string')
  const match = prompt.match(/Snapshot fingerprint \(echo exactly\): ([^\n]+)/)
  expect(match).not.toBeNull()
  return match![1].trim()
}

function reviewerResult(params: {
  snapshotFingerprint: string
  reviewedFiles: string[]
  verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
  findings?: string[]
}) {
  return feedJson({
    schemaVersion: 1,
    verdict: params.verdict,
    snapshotFingerprint: params.snapshotFingerprint,
    reviewedFiles: params.reviewedFiles,
    findings: params.findings ?? [],
    coverage: 'covered',
    dimensions: {
      correctness: 'pass',
      security: 'pass',
      tests: 'pass',
      apiCompatibility: 'pass',
      performance: 'pass',
    },
    requirementCoverage: [],
  })
}

describe('base2 deterministic gate lifecycle e2e', () => {
  test('recovers across validation and reviewer blockers before allowing finalization', () => {
    mkdirSync(path.dirname(LIFECYCLE_FILE), { recursive: true })
    writeFileSync(LIFECYCLE_FILE, 'export const lifecycle = "before"\n')
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Implement the lifecycle change.',
      params: {},
    } as any)

    // Invariant: codebase-oriented lifecycle prompts first gather indexed context.
    expect(gen.next().value).toMatchObject({
      toolName: 'query_index',
      input: {
        query: 'Implement the lifecycle change.',
        limit: 14,
        mode: 'search',
      },
    })

    // Invariant: retrieval routing is explicit before the working-tree snapshot.
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
      includeToolCall: false,
    })

    // Invariant: every lifecycle then starts from an explicit working-tree snapshot.
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'git_status',
      input: {},
    })

    // Invariant: context pruning happens before the first model step.
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')

    // Invariant 1: an edit detected after a model step opens the validation gate.
    expect(
      gen.next(finishStepWithToolResult({ file: LIFECYCLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status', input: {} })
    expect(
      gen.next(feedJson({ status: ` M ${LIFECYCLE_FILE}` })).value,
    ).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: [LIFECYCLE_FILE] },
    })

    // Invariant 2: a failing validation hook blocks finalization and reopens work.
    const validationFailed = gen.next(
      feedJson([
        {
          hookName: 'typecheck',
          exitCode: 1,
          stderr: 'TS2322: lifecycle value is not assignable',
        },
      ]),
    )
    expect(validationFailed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const validationFailureText = (validationFailed.value as any).input
      .content as string
    expect(validationFailureText).toContain('Verification gate')
    expect(validationFailureText).toContain('TS2322')
    expect(parseGateStateBlock(validationFailureText)).toMatchObject({
      gate: 'validation',
      status: 'failed',
    })

    // Invariant 4: validation blocker state is durable across generator yields.
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'blocked',
      pendingGateFiles: [LIFECYCLE_FILE],
      lastReviewerGateSkipReason: 'validation-hook-failures',
      nextRequiredAction:
        'Fix the blocking validation hook failures before doing anything else.',
    })

    // Invariant 3: the recovery iteration still starts with context pruning.
    expect(gen.next().value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    const validationPinnedState = gen.next()
    expect(validationPinnedState.value).toMatchObject({
      toolName: 'add_message',
    })
    expect((validationPinnedState.value as any).input.content).toContain(
      'Current phase: blocked',
    )
    expect((validationPinnedState.value as any).input.content).toContain(
      'Last reviewer gate skip/error reason: validation-hook-failures',
    )
    expect(gen.next().value).toBe('STEP')

    // Invariant 5: the model can apply a validation fix in the recovery step.
    expect(
      gen.next(finishStepWithToolResult({ file: LIFECYCLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status' })

    // Invariant 6: passing validation advances to reviewer instead of finalizing.
    expect(
      gen.next(feedJson({ status: ` M ${LIFECYCLE_FILE}` })).value,
    ).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: [LIFECYCLE_FILE] },
    })
    const blockingReviewerSpawn = gen.next(
      feedJson([{ hookName: 'typecheck', exitCode: 0, stdout: 'ok' }]),
    )
    expect(blockingReviewerSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })

    // Invariant 7: a BLOCKING reviewer verdict reopens the turn.
    const reviewerBlocked = gen.next(
      reviewerResult({
        snapshotFingerprint: reviewerFingerprintFromSpawn(
          blockingReviewerSpawn.value,
        ),
        reviewedFiles: [LIFECYCLE_FILE],
        verdict: 'BLOCKING',
        findings: ['Handle lifecycle retry idempotently.'],
      }),
    )
    expect(reviewerBlocked.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((reviewerBlocked.value as any).input.content).toContain(
      'BLOCKING: Handle lifecycle retry idempotently.',
    )

    // Invariant 8: reviewer blocker persists and is handed directly to the
    // repair-editor with typed path/tool permissions.
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'blocked',
      pendingGateFiles: [LIFECYCLE_FILE],
      openReviewerBlockers: ['BLOCKING: Handle lifecycle retry idempotently.'],
      nextRequiredAction:
        'Resolve the reviewer feedback below before any unrelated work, final response, or another review.',
    })
    const repairEditorSpawn = gen.next()
    expect(repairEditorSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'repair-editor',
            handoff: {
              schemaVersion: 1,
              findings: [
                {
                  files: [LIFECYCLE_FILE],
                  text: 'BLOCKING: Handle lifecycle retry idempotently.',
                },
              ],
              permissions: {
                readablePaths: [LIFECYCLE_FILE],
                writablePaths: [LIFECYCLE_FILE],
              },
            },
          },
        ],
      },
    })
    const findingIds = (
      repairEditorSpawn.value as any
    ).input.agents[0].handoff.findings.map(
      (finding: { id: string }) => finding.id,
    )
    writeFileSync(LIFECYCLE_FILE, 'export const lifecycle = "after"\n')
    expect(
      gen.next(
        feedJson({
          schemaVersion: 1,
          receiptId: 'reviewer-repair-receipt',
          status: 'completed',
          changedFiles: [{ path: LIFECYCLE_FILE }],
          findingsAddressed: findingIds,
          requestedValidation: [],
        }),
      ).value,
    ).toMatchObject({ toolName: 'git_status', input: {} })

    // The repair result re-enters the normal loop at context pruning, with
    // the blocker still pinned until validation and a fresh review clear it.
    expect(
      gen.next(feedJson({ status: ` M ${LIFECYCLE_FILE}` })).value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    const reviewerPinnedState = gen.next()
    expect(reviewerPinnedState.value).toMatchObject({ toolName: 'add_message' })
    expect((reviewerPinnedState.value as any).input.content).toContain(
      'Open reviewer blockers/feedback',
    )
    expect((reviewerPinnedState.value as any).input.content).toContain(
      'BLOCKING: Handle lifecycle retry idempotently.',
    )
    expect(gen.next().value).toBe('STEP')

    // Invariant 9: repair-editor already applied the requested fix, so the
    // parent model can finish without claiming another edit.
    expect(gen.next(finishStepWithToolResult({})).value).toMatchObject({
      toolName: 'git_status',
    })

    // Invariant 10: validation passes after the reviewer fix.
    expect(
      gen.next(feedJson({ status: ` M ${LIFECYCLE_FILE}` })).value,
    ).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: [LIFECYCLE_FILE] },
    })
    const finalReviewerSpawn = gen.next(
      feedJson([{ hookName: 'typecheck', exitCode: 0, stdout: 'ok' }]),
    )
    expect(finalReviewerSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })

    // Invariant 11: a non-blocking reviewer verdict permits finalization.
    const gatePassed = gen.next(
      reviewerResult({
        snapshotFingerprint: reviewerFingerprintFromSpawn(
          finalReviewerSpawn.value,
        ),
        reviewedFiles: [LIFECYCLE_FILE],
        verdict: 'NON_BLOCKING',
      }),
    )
    expect(gatePassed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const passText = (gatePassed.value as any).input.content as string
    expect(passText).toContain(
      'Automated validation and reviewer gate passed with NON_BLOCKING',
    )
    expect(parseGateStateBlock(passText)).toMatchObject({
      gate: 'validation/reviewer',
      status: 'passed',
    })

    // Invariant 12: final response is allowed only after all blockers clear.
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      pendingGateFiles: [],
      openReviewerBlockers: [],
      nextRequiredAction: '',
      gatePassedPendingFiles: [LIFECYCLE_FILE],
      gatePassedReviewerVerdict: 'NON_BLOCKING',
    })
    expect((agentState as any).canSuggestFollowups).toBe(true)
  })
})
