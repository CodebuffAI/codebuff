import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { createTestAgentRuntimeParams } from '@codebuff/common/testing/fixtures/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { promptSuccess } from '@codebuff/common/util/error'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, it, mock } from 'bun:test'

import { loopAgentSteps } from '../run-agent-step'
import { clearAgentGeneratorCache } from '../run-programmatic-step'
import { mockFileContext } from './test-utils'

import type { AgentTemplate } from '../templates/types'
import type { AgentState } from '@codebuff/common/types/session-state'

/**
 * Regression tests for the AbortSignal-based cancellation path in
 * loopAgentSteps. These guard the `signal.aborted` checkpoints at
 * run-agent-step.ts lines ~889, ~1104, and ~1369.
 *
 * The wall-clock timeout fix in spawn-agent-utils.ts relies on these
 * checkpoints: when executeSubagent's timeout controller aborts the
 * combined signal, loopAgentSteps must actually exit (as 'cancelled') so
 * the stuck LLM stream is cancelled rather than orphaned. If a future
 * refactor removes these checks, the timeout will reject the outer
 * promise but the inner stream keeps running — these tests catch that.
 */
describe('loopAgentSteps abort signal handling', () => {
  let agentTemplate: AgentTemplate
  let agentState: AgentState
  let baseParams: Parameters<typeof loopAgentSteps>[0]
  let runtimeParams: Omit<
    ReturnType<typeof createTestAgentRuntimeParams>,
    'agentTemplate' | 'localAgentTemplates'
  >

  afterEach(() => {
    clearAgentGeneratorCache(runtimeParams)
    mock.restore()
  })

  const setup = () => {
    const {
      agentTemplate: _,
      localAgentTemplates: __,
      ...baseRuntimeParams
    } = createTestAgentRuntimeParams()
    runtimeParams = baseRuntimeParams
    runtimeParams.promptAiSdkStream = mock(async function* () {
      // Simulate a stuck-ish stream that yields one text chunk but never
      // calls end_turn. Without the abort checkpoint, the loop would keep
      // stepping forever.
      yield { type: 'text' as const, text: 'partial LLM response\n\n' }
      return promptSuccess('mock-message-id')
    })

    agentTemplate = {
      id: 'test-agent',
      displayName: 'Test Agent',
      spawnerPrompt: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['read_files', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test user prompt',
      stepPrompt: 'Test agent step prompt',
      handleSteps: undefined,
    } satisfies AgentTemplate as AgentTemplate

    const sessionState = getInitialSessionState(mockFileContext)
    agentState = {
      ...sessionState.mainAgentState,
      agentId: 'test-agent-id',
      messageHistory: [
        userMessage('Initial message'),
        assistantMessage('Initial response'),
      ],
      output: undefined,
      stepsRemaining: 10,
    }

    baseParams = {
      ...runtimeParams,
      agentType: 'test-agent',
      localAgentTemplates: { 'test-agent': agentTemplate },
      repoId: undefined,
      repoUrl: undefined,
      userInputId: 'test-user-input',
      agentState,
      prompt: 'Test prompt',
      spawnParams: undefined,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      ancestorRunIds: [],
      onResponseChunk: () => {},
      signal: new AbortController().signal,
    }
  }

  it('returns a cancelled error output when the signal is already aborted before the run starts (line ~889 checkpoint)', async () => {
    setup()
    const controller = new AbortController()
    controller.abort(new Error('pre-aborted'))
    baseParams.signal = controller.signal

    const result = await loopAgentSteps({ ...baseParams })

    // The line-~889 checkpoint returns an error output with the cancelled
    // message BEFORE entering the step loop or calling the LLM.
    expect(result.output.type).toBe('error')
    if (result.output.type === 'error') {
      expect(result.output.message).toMatch(/cancelled/i)
    }
  })

  it('exits the step loop as cancelled when the signal aborts mid-run (line ~1104 checkpoint) instead of looping forever', async () => {
    setup()
    const controller = new AbortController()
    baseParams.signal = controller.signal

    // Use a handleSteps generator that takes a few steps so we can abort
    // between steps. STEP advances the model; the checkpoint at the top of
    // the while-loop (line ~1104) checks signal.aborted before each step.
    let stepCount = 0
    agentTemplate.handleSteps = function* () {
      while (true) {
        yield 'STEP'
        stepCount++
        if (stepCount >= 2) {
          // Abort between steps — the next loop iteration must see
          // signal.aborted and throw AbortError rather than calling the
          // LLM again.
          controller.abort(new Error('aborted mid-run'))
        }
        // Safety: never let the generator run away in a broken test.
        if (stepCount >= 5) break
      }
    }

    const result = await loopAgentSteps({ ...baseParams })

    // The run must have ended (not hung). The error-path checkpoint at
    // line ~1369 sets status='cancelled' when signal.aborted, so the
    // returned output reflects the cancellation.
    expect(stepCount).toBeGreaterThanOrEqual(2)
    expect(result.output.type).toBe('error')
    if (result.output.type === 'error') {
      // Aborted-mid-run surfaces an abort-related error, not a generic
      // failure. The exact message depends on where the AbortError was
      // caught, but it should not be a clean success.
      expect(result.output.message).not.toBe('')
    }
  })

  it('completes normally with an un-aborted signal (sanity check — abort path does not fire spuriously)', async () => {
    setup()
    // A handleSteps that runs one STEP and ends cleanly.
    agentTemplate.handleSteps = function* () {
      yield 'STEP'
    }

    const result = await loopAgentSteps({ ...baseParams })

    // With a non-aborting signal and a single-step generator, the run
    // should complete without hitting any abort checkpoint.
    expect(result.agentState.agentId).toBe('test-agent-id')
    // outputMode is structured_output; the mock stream's text chunk is
    // captured. We just assert the run didn't return the cancelled error.
    expect(result.output.type).not.toBe('error')
  })
})
