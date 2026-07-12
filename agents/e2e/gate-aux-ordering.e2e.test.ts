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
        limit: 20,
      },
    })

    // 2) Working-tree snapshot.
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
    const testWriterYield = gen.next(
      feedJson({ status: ` M ${AUX_TRIPLE_FILE}` }),
    )
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
    const docWriterYield = gen.next(feedJson([]))
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
    const securityReviewerYield = gen.next(feedJson([]))
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

    // Invariant 3: after all three aux gates fire, auxGateFiredThisIteration
    // causes a `continue` that re-enters the loop. The re-loop starts with a
    // fresh context-pruner spawn.
    const reLoopContextPruner = gen.next(
      feedJson(['NON_BLOCKING: No security concerns found.']),
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

    // Re-loop model step: no new files, same pending set. Finishing drives to
    // git_status, NOT directly to run_file_change_hooks.
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next(finishStepWithToolResult({ file: AUX_TRIPLE_FILE })).value,
    ).toMatchObject({ toolName: 'git_status', input: {} })

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
    const gatePassed = gen.next(feedJson(['LOOKS_GOOD: All clear.']))
    expect(gatePassed.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const passText = (gatePassed.value as any).input.content as string
    expect(passText).toContain(
      'Automated validation and reviewer gate passed with LOOKS_GOOD',
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

    // First iteration fires all three aux gates in order.
    expect(
      gen.next(feedJson({ status: ` M ${AUX_TRIPLE_FILE}` })).value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'test-writer' },
    })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'doc-writer' },
    })
    expect(gen.next(feedJson([])).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'security-reviewer' },
    })
    expect((agentState as any).base2ActiveWork).toMatchObject({
      testWriterGateDone: true,
      docWriterGateDone: true,
      securityReviewGateDone: false,
      preEditSecurityReviewDone: false,
    })

    // The aux block `continue`d; re-loop starts with context-pruner.
    expect(
      gen.next(feedJson(['NON_BLOCKING: No security concerns found.'])).value,
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
