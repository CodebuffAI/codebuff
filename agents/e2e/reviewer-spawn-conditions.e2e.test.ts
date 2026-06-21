import { describe, expect, test } from 'bun:test'

import { createBase2 } from '../base2/base2'

function parseGateStateBlock(
  text: string,
): { gate: string; status: string; details: string } {
  const match = text.match(/<gate-state>([\s\S]*?)<\/gate-state>/)
  expect(match).not.toBeNull()
  return JSON.parse(match![1]) as { gate: string; status: string; details: string }
}

function feedJson(value: unknown) {
  return { toolResult: [{ type: 'json', value }] } as any
}

function finishStep(value: unknown) {
  return {
    stepsComplete: true,
    toolResult: [{ type: 'json', value }],
  } as any
}

describe('base2 reviewer spawn conditions e2e', () => {
  test('default mode with edits and passing validation spawns code-reviewer', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2-custom' },
      prompt: 'Edit the lifecycle file.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({
      toolName: 'query_index',
      input: { query: 'Edit the lifecycle file.', limit: 20 },
    })
    expect(gen.next(feedJson([])).value).toMatchObject({ toolName: 'git_status' })
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(gen.next(finishStep({ file: 'src/lifecycle.ts' })).value).toMatchObject({
      toolName: 'git_status',
    })
    expect(gen.next(feedJson({ status: ' M src/lifecycle.ts' })).value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/lifecycle.ts'] },
    })

    const reviewerSpawn = gen.next(
      feedJson([{ hookName: 'typecheck', exitCode: 0, stdout: 'ok' }]),
    )
    expect(reviewerSpawn.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })
  })

  test('fast mode skips disabled validation and reviewer gates with explicit state', () => {
    const base2 = createBase2('fast')
    const agentState = { agentId: 'base2-fast' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Edit the lifecycle file quickly.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({
      toolName: 'query_index',
      input: { query: 'Edit the lifecycle file quickly.', limit: 20 },
    })
    expect(gen.next(feedJson([])).value).toMatchObject({ toolName: 'git_status' })
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(gen.next(finishStep({ file: 'src/lifecycle.ts' })).value).toMatchObject({
      toolName: 'git_status',
    })

    const skippedGate = gen.next(feedJson({ status: ' M src/lifecycle.ts' }))
    expect(skippedGate.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const skipText = (skippedGate.value as any).input.content as string
    expect(skipText).toContain('validation-and-reviewer-gates-disabled')
    const skipGate = parseGateStateBlock(skipText)
    expect(skipGate).toMatchObject({
      gate: 'validation/reviewer',
      status: 'skipped',
    })
    expect(skipGate.details).toContain('validation-and-reviewer-gates-disabled')
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/lifecycle.ts'],
      pendingGateFiles: ['src/lifecycle.ts'],
      lastReviewerGateSkipReason: 'validation-and-reviewer-gates-disabled',
    })

    const done = gen.next()
    expect(done.done).toBe(true)
  })

  test('no edits detected emits passed no-edits gate and does not spawn reviewer', () => {
    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const gen = base2.handleSteps!({
      agentState,
      prompt: 'Inspect without editing.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(gen.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(gen.next({ stepsComplete: true, toolResult: [] } as any).value).toMatchObject({
      toolName: 'git_status',
    })

    const noEditsGate = gen.next(feedJson({ status: '' }))
    expect(noEditsGate.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const noEditsText = (noEditsGate.value as any).input.content as string
    expect(noEditsText).toContain('No edited files were detected.')
    const noEditsState = parseGateStateBlock(noEditsText)
    expect(noEditsState).toMatchObject({
      gate: 'validation/reviewer',
      status: 'passed',
    })
    expect(noEditsState.details).toContain('no edited files were detected')
    expect((agentState as any).base2ActiveWork).toMatchObject({
      currentPhase: 'final_response_allowed',
      pendingGateFiles: [],
    })

    expect(gen.next().value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    expect(gen.next({ stepsComplete: true, toolResult: [] } as any).value).toMatchObject({
      toolName: 'git_status',
    })
    expect(gen.next(feedJson({ status: '' })).done).toBe(true)
  })

  test('unsafe edits without pending files blocks finalization and skips reviewer', () => {
    const base2 = createBase2('default')
    const agentState = {
      agentId: 'base2-custom',
      base2ActiveWork: {
        changedFiles: ['src/lifecycle.ts'],
        touchedFiles: ['src/lifecycle.ts'],
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
      prompt: 'Finish the previous lifecycle work.',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(gen.next(feedJson({ status: ' M src/lifecycle.ts' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    const pinned = gen.next()
    expect(pinned.value).toMatchObject({ toolName: 'add_message' })
    expect((pinned.value as any).input.content).toContain(
      'Current phase: awaiting_validation',
    )
    expect(gen.next().value).toBe('STEP')
    expect(gen.next({ stepsComplete: true, toolResult: [] } as any).value).toMatchObject({
      toolName: 'git_status',
    })

    const blocked = gen.next(feedJson({ status: ' M src/lifecycle.ts' }))
    expect(blocked.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const blockedText = (blocked.value as any).input.content as string
    expect(blockedText).toContain('edits-detected-without-pending-gate-files')
    expect(blockedText).toContain('cannot safely continue')
    const blockedState = parseGateStateBlock(blockedText)
    expect(blockedState).toMatchObject({
      gate: 'validation/reviewer',
      status: 'failed',
    })
    expect(blockedState.details).toContain(
      'edits-detected-without-pending-gate-files',
    )
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/lifecycle.ts'],
      pendingGateFiles: [],
      currentPhase: 'blocked',
      lastReviewerGateSkipReason: 'edits-detected-without-pending-gate-files',
      nextRequiredAction:
        'Unsafe reviewer gate state: edits were detected without pending gate files. Re-read the edited files/status, make a minimal follow-up edit if needed to restore pending gate files, then finish so validation/review can run safely.',
    })
  })
})
