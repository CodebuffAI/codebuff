import { describe, expect, test } from 'bun:test'

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

function writerNoopResult(receiptId: string) {
  const agentReceipt = {
    schemaVersion: 1,
    receiptId,
    status: 'completed',
    changedFiles: [],
    findingsAddressed: [],
    requestedValidation: [],
    completionKind: 'noop',
    evidence: ['Existing coverage already satisfies the requested behavior.'],
  }
  return feedJson({
    agentId: 'aux-writer-1',
    agentName: 'Auxiliary Writer',
    agentType: 'test-writer',
    value: {},
    agentReceipt,
  })
}

function reviewerFingerprintFromSpawn(value: any): string {
  const prompt = value?.input?.agents?.[0]?.prompt
  expect(typeof prompt).toBe('string')
  const match = prompt.match(/Snapshot fingerprint \(echo exactly\): ([^\n]+)/)
  expect(match).not.toBeNull()
  return match![1].trim()
}

function reviewerValue(snapshotFingerprint: string, reviewedFiles: string[]) {
  return {
    schemaVersion: 1,
    family: 'reviewer',
    verdict: 'NON_BLOCKING',
    snapshotFingerprint,
    reviewedFiles,
    findings: [],
    coverage: 'covered',
    dimensions: {},
    requirementCoverage: [],
  }
}

function reviewerResult(snapshotFingerprint: string, reviewedFiles: string[]) {
  return feedJson(reviewerValue(snapshotFingerprint, reviewedFiles))
}

function spawnedReviewerResult(
  agentType: string,
  snapshotFingerprint: string,
  reviewedFiles: string[],
) {
  return feedJson({
    agentType,
    value: reviewerValue(snapshotFingerprint, reviewedFiles),
  })
}

function staleSpawnedReviewerResult(
  agentType: string,
  snapshotFingerprint: string,
  reviewedFiles: string[],
) {
  return feedJson({
    agentType,
    value: {
      schemaVersion: 1,
      family: 'reviewer',
      verdict: 'BLOCKING',
      snapshotFingerprint,
      reviewedFiles,
      findings: [
        {
          id: 'reliability-reviewer:correctness:stale-snapshot',
          severity: 'critical',
          dimension: 'correctness',
          summary: 'The supplied snapshot is stale and does not match.',
          evidence: ['The current review bundle has a newer snapshot.'],
          correction: 'Refresh the bundle and retry once.',
        },
      ],
      coverage: 'missing',
      dimensions: { correctness: 'block' },
      requirementCoverage: [],
    },
  })
}

function crashedSpawnedReviewerResult(
  agentType: string,
  snapshotFingerprint: string,
  reviewedFiles: string[],
) {
  return feedJson({
    agentType,
    value: {
      ...reviewerValue(snapshotFingerprint, reviewedFiles),
      verdict: 'LOOKS_GOOD',
      runtime: {
        errorMessage: 'Specialist process crashed after emitting its verdict.',
      },
    },
  })
}

// A pending gate file that satisfies ALL THREE pre-reviewer aux predicates in
// a single iteration:
//  - test-writer: non-test source under `cli/src/` -> inferPackageTestCommand
//    returns `'cd cli && bun run typecheck && bun test'` and isNonTestSourceFile
//    is true, so selectTestWriterTargets keeps it.
//  - doc-writer: `cli/src/` -> isPublicApiSourceFile is true, so
//    selectDocWriterTargets keeps it.
//  - security-reviewer: the `auth` path segment is in SECURITY_SENSITIVE_GLOBS,
//    so matchesSecuritySensitiveGlob is true.
const AUX_TRIPLE_FILE = 'cli/src/auth/session.ts'
const AUX_TEST_COMMAND = 'cd cli && bun run typecheck && bun test'

// All aux gates use spawn_agent_inline with includeToolCall:false.
const AUX_AGENT_TYPES = ['test-writer', 'doc-writer', 'security-reviewer']

function isAuxSpawn(value: any): boolean {
  return (
    value?.toolName === 'spawn_agent_inline' &&
    AUX_AGENT_TYPES.includes(value?.input?.agent_type)
  )
}

describe('base2 pre-reviewer aux gate ordering e2e', () => {
  test('fires test-writer -> doc-writer -> security-reviewer before validation hooks + code-reviewer, then does not re-spawn', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const prompt =
      'Implement the auth session lifecycle change, add tests, and update docs.'
    const gen = base2.handleSteps!({
      agentState,
      // 'implement' + 'code' triggers shouldProactivelyQueryIndex.
      prompt,
      params: {},
    } as any)

    // 1) Codebase-oriented prompts first gather indexed context.
    expect(gen.next().value).toMatchObject({
      toolName: 'query_index',
      input: {
        query: prompt,
        limit: 14,
        mode: 'search',
      },
    })

    // 2) Retrieval routing annotation, then working-tree snapshot.
    const retrievalRoute = gen.next(feedJson([])).value
    expect(retrievalRoute).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
      includeToolCall: false,
    })
    expect((retrievalRoute as any).input.content).toContain(
      'Proactive retrieval route',
    )
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'git_status',
      input: {},
    })

    // 3) Context pruning before the first model step.
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')

    // 4) The model step edits the triple-aux-relevant file, then finishes.
    expect(
      gen.next(finishStepWithToolResult({ file: AUX_TRIPLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status', input: {} })

    // 5) git_status reports the pending edit -> the aux block fires.
    const environmentYield = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
    expect(environmentYield.value).toMatchObject({
      toolName: 'inspect_environment',
      input: {},
      includeToolCall: false,
    })
    const affectedTestsYield = gen.next(feedJson({ workspaces: [] }))
    expect(affectedTestsYield.value).toMatchObject({
      toolName: 'get_affected_tests',
      input: { files: [AUX_TRIPLE_FILE] },
      includeToolCall: false,
    })
    const buildTargetsYield = gen.next(
      feedJson({
        targets: [
          {
            source: AUX_TRIPLE_FILE,
            candidates: [],
            packageRoot: 'cli',
          },
        ],
      }),
    )
    expect(buildTargetsYield.value).toMatchObject({
      toolName: 'get_build_targets',
      input: { files: [AUX_TRIPLE_FILE] },
      includeToolCall: false,
    })
    const testWriterYield = gen.next(feedJson({ targets: [] }))
    // Invariant 1a: test-writer fires FIRST (before validation hooks and
    // code-reviewer), via spawn_agent_inline with includeToolCall:false.
    expect(testWriterYield.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'test-writer',
        params: {
          target_files: [AUX_TRIPLE_FILE],
          test_command: AUX_TEST_COMMAND,
        },
      },
      includeToolCall: false,
    })

    // Invariant 2a: the test-writer yield suspends; the doc-writer if-block
    // only runs AFTER we resume the generator.
    const testValidationYield = gen.next(writerNoopResult('test-writer-noop'))
    expect(testValidationYield.value).toMatchObject({
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'basher',
            params: { command: AUX_TEST_COMMAND },
          },
        ],
      },
      includeToolCall: false,
    })
    const docWriterYield = gen.next(
      feedJson([{ command: AUX_TEST_COMMAND, exitCode: 0, stdout: 'ok' }]),
    )
    // Invariant 1b: doc-writer fires SECOND.
    expect(docWriterYield.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'doc-writer',
        params: {
          source_files: [AUX_TRIPLE_FILE],
        },
      },
      includeToolCall: false,
    })

    // Invariant 2b: the doc-writer yield suspends; the security-reviewer
    // if-block only runs AFTER we resume the generator.
    const securityReviewerYield = gen.next(writerNoopResult('doc-writer-noop'))
    // Invariant 1c: security-reviewer fires THIRD.
    expect(securityReviewerYield.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'security-reviewer',
        params: { changed_files: [AUX_TRIPLE_FILE] },
      },
      includeToolCall: false,
    })

    // Invariant 2c: exact aux ordering is test-writer -> doc-writer ->
    // security-reviewer (the THIRD aux yield is security-reviewer, proving the
    // sequence is not shuffled).
    expect((testWriterYield.value as any).input.agent_type).toBe('test-writer')
    expect((docWriterYield.value as any).input.agent_type).toBe('doc-writer')
    expect((securityReviewerYield.value as any).input.agent_type).toBe(
      'security-reviewer',
    )

    // The security gate is not marked done until its yielded reviewer result
    // is resumed and validated.
    expect((agentState as any).base2ActiveWork).toMatchObject({
      testWriterGateDone: true,
      docWriterGateDone: true,
      securityReviewGateDone: false,
      preEditSecurityReviewDone: false,
    })

    // The auth/session file also routes through the deterministic reliability
    // specialist gate. It must review the same snapshot before the aux block
    // can re-enter the loop.
    const securityFingerprint = (securityReviewerYield.value as any).input
      .params.snapshot_fingerprint as string
    const specialistBundle = gen.next(
      reviewerResult(securityFingerprint, [AUX_TRIPLE_FILE]),
    )
    expect(specialistBundle.value).toMatchObject({
      toolName: 'get_change_review_bundle',
      input: {},
      includeToolCall: false,
    })
    const specialistSpawn = gen.next(
      feedJson({ snapshotId: 'aux-ordering-snapshot', files: [AUX_TRIPLE_FILE] }),
    )
    expect(specialistSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'reliability-reviewer' }] },
      includeToolCall: false,
    })

    // A stale snapshot is refreshed and retried inside the same gate
    // iteration, before the root model gets another STEP and can manually
    // re-spawn the specialist from compacted prose.
    const refreshedBundle = gen.next(
      staleSpawnedReviewerResult(
        'reliability-reviewer',
        'aux-ordering-snapshot',
        [AUX_TRIPLE_FILE],
      ),
    )
    expect(refreshedBundle.value).toMatchObject({
      toolName: 'get_change_review_bundle',
      input: {},
      includeToolCall: false,
    })
    const refreshedSpecialistSpawn = gen.next(
      feedJson({ snapshotId: 'aux-ordering-snapshot-refreshed' }),
    )
    expect(refreshedSpecialistSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'reliability-reviewer',
            params: { snapshot_id: 'aux-ordering-snapshot-refreshed' },
          },
        ],
      },
      includeToolCall: false,
    })

    // Invariant 3: after every routed aux gate passes,
    // auxGateFiredThisIteration re-enters the loop at context pruning.
    const reLoopContextPruner = gen.next(
      spawnedReviewerResult(
        'reliability-reviewer',
        'aux-ordering-snapshot-refreshed',
        [AUX_TRIPLE_FILE],
      ),
    )
    expect(reLoopContextPruner.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(isAuxSpawn(reLoopContextPruner.value)).toBe(false)

    // The re-loop re-emits the pinned active-work state (phase is now
    // awaiting_validation with pending gate files).
    const reLoopPinnedState = gen.next()
    expect(reLoopPinnedState.value).toMatchObject({ toolName: 'add_message' })
    expect((reLoopPinnedState.value as any).input.content).toContain(
      'Current phase: awaiting_validation',
    )
    expect((reLoopPinnedState.value as any).input.content).toContain(
      `Pending validation/reviewer gate files: ${AUX_TRIPLE_FILE}`,
    )

    // Re-loop model step: no new edits, same pending set. Finishing drives to
    // git_status, NOT directly to run_file_change_hooks.
    expect(gen.next().value).toBe('STEP')
    expect(gen.next(finishStepWithToolResult({})).value).toMatchObject({
      toolName: 'git_status',
      input: {},
    })

    // Invariant 4 (no infinite re-spawn loop): with the same aux-relevant
    // pending file set, the done-flags stay true and selectAuxRelevantFiles
    // filters out nothing new, so the aux block skips entirely. The next yield
    // is the FINAL validation gate (run_file_change_hooks). Assert NO
    // spawn_agent_inline for any aux agent_type occurs here.
    const finalValidationGate = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
    expect(isAuxSpawn(finalValidationGate.value)).toBe(false)
    expect(finalValidationGate.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: [AUX_TRIPLE_FILE] },
    })

    // The done-flags persist across the re-loop (no reset, no respawn).
    expect((agentState as any).base2ActiveWork).toMatchObject({
      testWriterGateDone: true,
      docWriterGateDone: true,
      preEditSecurityReviewDone: true,
    })

    // 8) Passing validation hooks advance to the code-reviewer spawn_agents
    // gate (the FINAL reviewer gate), NOT another aux spawn.
    const reviewerSpawn = gen.next(
      feedJson([{ hookName: 'typecheck', exitCode: 0, stdout: 'ok' }]),
    )
    expect(isAuxSpawn(reviewerSpawn.value)).toBe(false)
    expect(reviewerSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })

    // 9) A LOOKS_GOOD reviewer verdict finalizes.
    const finalReviewerFingerprint = reviewerFingerprintFromSpawn(
      reviewerSpawn.value,
    )
    const gatePassed = gen.next(
      reviewerResult(finalReviewerFingerprint, [AUX_TRIPLE_FILE]),
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

    // 10) Finalization clears the pending files and resets per-edit-set aux
    // flags so a future distinct edit set can run them again.
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      testWriterGateDone: false,
      docWriterGateDone: false,
      securityReviewGateDone: false,
      preEditSecurityReviewDone: false,
      pendingGateFiles: [],
    })
  })

  test('blocks without finalization when a routed specialist returns stale attestations twice', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Implement the auth session lifecycle change.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'query_index' })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'add_message',
      includeToolCall: false,
    })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'git_status',
    })
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next(finishStepWithToolResult({ file: AUX_TRIPLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status' })

    const securityReviewerYield = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
    expect(securityReviewerYield.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'security-reviewer' },
    })
    const securityFingerprint = (securityReviewerYield.value as any).input
      .params.snapshot_fingerprint as string
    expect(
      gen.next(reviewerResult(securityFingerprint, [AUX_TRIPLE_FILE])).value,
    ).toMatchObject({ toolName: 'get_change_review_bundle' })
    expect(
      gen.next(
        feedJson({
          snapshotId: 'specialist-protocol-snapshot',
          files: [AUX_TRIPLE_FILE],
        }),
      ).value,
    ).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'reliability-reviewer' }] },
    })

    // The first stale attestation uses the one bounded bundle refresh/retry.
    expect(
      gen.next(
        staleSpawnedReviewerResult(
          'reliability-reviewer',
          'specialist-protocol-snapshot',
          [AUX_TRIPLE_FILE],
        ),
      ).value,
    ).toMatchObject({ toolName: 'get_change_review_bundle' })
    const retrySpawn = gen.next(
      feedJson({ snapshotId: 'specialist-protocol-snapshot-refreshed' }),
    )
    expect(retrySpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'reliability-reviewer',
            params: { snapshot_id: 'specialist-protocol-snapshot-refreshed' },
          },
        ],
      },
    })

    // The retry is also stale: fail closed rather than clearing the gate or
    // spawning repair-editor for a reviewer-protocol failure.
    const blocked = gen.next(
      staleSpawnedReviewerResult(
        'reliability-reviewer',
        'specialist-protocol-snapshot-refreshed',
        [AUX_TRIPLE_FILE],
      ),
    )
    expect(blocked.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
      includeToolCall: false,
    })
    expect((blocked.value as any).input.content).toContain(
      'did not spawn repair-editor or finalize',
    )
    expect(gen.next().done).toBe(true)
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'blocked',
      pendingGateFiles: [AUX_TRIPLE_FILE],
      gatePassedFiles: [],
      lastReviewerGateSkipReason: 'specialist-terminal-failure',
      nextRequiredAction: expect.stringContaining(
        'fresh matching specialist review',
      ),
    })
    expect((agentState as any).base2ActiveWork.openReviewerBlockers).not.toEqual(
      [],
    )
    expect((agentState as any).canSuggestFollowups).toBe(false)
  })

  test('fails closed when a routed specialist crashes alongside a valid LOOKS_GOOD attestation', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Implement the auth session lifecycle change.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'query_index' })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'add_message',
      includeToolCall: false,
    })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'git_status',
    })
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next(finishStepWithToolResult({ file: AUX_TRIPLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status' })

    const securityReviewerYield = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
    expect(securityReviewerYield.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'security-reviewer' },
    })
    const securityFingerprint = (securityReviewerYield.value as any).input
      .params.snapshot_fingerprint as string
    expect(
      gen.next(reviewerResult(securityFingerprint, [AUX_TRIPLE_FILE])).value,
    ).toMatchObject({ toolName: 'get_change_review_bundle' })
    expect(
      gen.next(
        feedJson({
          snapshotId: 'specialist-crash-snapshot',
          files: [AUX_TRIPLE_FILE],
        }),
      ).value,
    ).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'reliability-reviewer' }] },
    })

    const blocked = gen.next(
      crashedSpawnedReviewerResult(
        'reliability-reviewer',
        'specialist-crash-snapshot',
        [AUX_TRIPLE_FILE],
      ),
    )
    expect(blocked.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
      includeToolCall: false,
    })
    expect((blocked.value as any).input.content).toContain(
      'did not spawn repair-editor or finalize',
    )
    expect(gen.next().done).toBe(true)
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'blocked',
      pendingGateFiles: [AUX_TRIPLE_FILE],
      gatePassedFiles: [],
      specialistReviewGatesDone: [],
      lastReviewerGateSkipReason: 'specialist-terminal-failure',
      nextRequiredAction: expect.stringContaining(
        'fresh matching specialist review',
      ),
    })
    expect((agentState as any).base2ActiveWork.openReviewerBlockers).toEqual([
      expect.stringContaining('crashed during specialist review'),
    ])
    expect((agentState as any).canSuggestFollowups).toBe(false)
  })

  test('does not re-spawn any aux gate on a second iteration with the same aux-relevant pending file set', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt:
        'Implement the auth session lifecycle change, add tests, and update docs.',
      params: {},
    } as any)

    // Drive to the point where all three aux gates have fired once.
    expect(gen.next().value).toMatchObject({ toolName: 'query_index' })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'add_message',
      includeToolCall: false,
    })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'git_status',
    })
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(gen.next(finishStepWithToolResult({})).value).toMatchObject({
      toolName: 'git_status',
    })

    // First iteration fires all three aux gates in order.
    const environmentYield = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
    expect(environmentYield.value).toMatchObject({
      toolName: 'inspect_environment',
      input: {},
      includeToolCall: false,
    })
    expect(gen.next(feedJson({ workspaces: [] })).value).toMatchObject({
      toolName: 'get_affected_tests',
      input: { files: [AUX_TRIPLE_FILE] },
      includeToolCall: false,
    })
    expect(
      gen.next(
        feedJson({
          targets: [
            {
              source: AUX_TRIPLE_FILE,
              candidates: [],
              packageRoot: 'cli',
            },
          ],
        }),
      ).value,
    ).toMatchObject({
      toolName: 'get_build_targets',
      input: { files: [AUX_TRIPLE_FILE] },
      includeToolCall: false,
    })
    expect(gen.next(feedJson({ targets: [] })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'test-writer' },
    })
    expect(
      gen.next(writerNoopResult('test-writer-noop-2')).value,
    ).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'basher' }] },
      includeToolCall: false,
    })
    expect(
      gen.next(feedJson([{ exitCode: 0, stdout: 'ok' }])).value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'doc-writer' },
    })
    const securityReviewerYield = gen.next(
      writerNoopResult('doc-writer-noop-2'),
    )
    expect(securityReviewerYield.value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'security-reviewer' },
    })
    expect((agentState as any).base2ActiveWork).toMatchObject({
      testWriterGateDone: true,
      docWriterGateDone: true,
      securityReviewGateDone: false,
      preEditSecurityReviewDone: false,
    })

    const securityFingerprint = (securityReviewerYield.value as any).input
      .params.snapshot_fingerprint as string
    const specialistBundle = gen.next(
      reviewerResult(securityFingerprint, [AUX_TRIPLE_FILE]),
    )
    expect(specialistBundle.value).toMatchObject({
      toolName: 'get_change_review_bundle',
      input: {},
      includeToolCall: false,
    })
    const specialistSpawn = gen.next(
      feedJson({ snapshotId: 'aux-idempotency-snapshot', files: [AUX_TRIPLE_FILE] }),
    )
    expect(specialistSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'reliability-reviewer' }] },
      includeToolCall: false,
    })

    // The aux block `continue`d; re-loop starts with context-pruner.
    expect(
      gen.next(
        spawnedReviewerResult(
          'reliability-reviewer',
          'aux-idempotency-snapshot',
          [AUX_TRIPLE_FILE],
        ),
      ).value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    // Pinned state + model step with the SAME pending file (no new files added
    // -> aux-relevant snapshot is stable -> no resetAuxGateFlags).
    expect(gen.next().value).toMatchObject({ toolName: 'add_message' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next(finishStepWithToolResult({ file: AUX_TRIPLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status' })

    // Idempotency invariant: on this second iteration reaching the aux block
    // with the same aux-relevant pending file set, NONE of the three aux gates
    // re-spawn. The next yield goes straight to run_file_change_hooks.
    const secondIterationNext = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
    expect(isAuxSpawn(secondIterationNext.value)).toBe(false)
    expect(secondIterationNext.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: [AUX_TRIPLE_FILE] },
    })

    // Done-flags remain true (no reset happened).
    expect((agentState as any).base2ActiveWork).toMatchObject({
      testWriterGateDone: true,
      docWriterGateDone: true,
      preEditSecurityReviewDone: true,
    })
  })
})
