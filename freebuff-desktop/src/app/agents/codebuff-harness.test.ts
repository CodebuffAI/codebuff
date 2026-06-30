import { describe, expect, test } from 'bun:test'

import { CodebuffHarness } from './codebuff-harness'
import type { HarnessCallbacks, HarnessTurn } from './harness'

/** Minimal CodebuffClient stub: `run` returns whatever RunState we hand it. */
function clientReturning(run: unknown) {
  return { run: async () => run } as any
}

function makeTurn(overrides: Partial<HarnessTurn> = {}): HarnessTurn {
  return {
    prompt: 'do the thing',
    cwd: '/tmp/repo',
    toolDeps: {
      onSuggest: () => {},
      onWriteDoc: async () => ({ ok: true }),
      onBrowserCheck: async () => ({}) as any,
    } as any,
    abort: new AbortController(),
    ...overrides,
  }
}

function noopCallbacks(): HarnessCallbacks {
  return {
    onText: () => {},
    onReasoning: () => {},
    onEvent: () => {},
    drainSteering: () => [],
  }
}

describe('CodebuffHarness error output handling', () => {
  test('throws the message when the run resolves with an error output', async () => {
    // The SDK resolves (does not reject) on a run-level failure — e.g. a free-mode
    // gate rejection — surfacing it as `output.type === 'error'`. The harness must
    // re-throw so the engine reports a turn failure instead of a silent empty turn.
    const harness = new CodebuffHarness(
      clientReturning({
        output: { type: 'error', message: 'Daily limit reached for MiniMax M3.' },
      }),
    )

    await expect(harness.runTurn(makeTurn(), noopCallbacks())).rejects.toThrow(
      'Daily limit reached for MiniMax M3.',
    )
  })

  test('falls back to a generic message when the error output has none', async () => {
    const harness = new CodebuffHarness(
      clientReturning({ output: { type: 'error' } }),
    )

    await expect(harness.runTurn(makeTurn(), noopCallbacks())).rejects.toThrow(
      'The agent did not return a response.',
    )
  })

  test('does not throw on an aborted turn that resolves as an error output', async () => {
    // A user Stop aborts the run; the SDK resolves with an error output too. The
    // engine owns abort handling, so the harness must NOT report it as a failure.
    const abort = new AbortController()
    abort.abort()
    const run = { output: { type: 'error', message: 'Run cancelled by user.' } }
    const harness = new CodebuffHarness(clientReturning(run))

    const result = await harness.runTurn(makeTurn({ abort }), noopCallbacks())
    expect(result.state).toBe(run)
  })

  test('returns the run state on a successful (non-error) output', async () => {
    const run = { output: { type: 'lastMessage', value: [] } }
    const harness = new CodebuffHarness(clientReturning(run))

    const result = await harness.runTurn(makeTurn(), noopCallbacks())
    expect(result.state).toBe(run)
  })
})
