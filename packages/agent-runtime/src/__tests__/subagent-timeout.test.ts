import { withTimeout } from '@codebuff/common/util/promise'
import { spyOn, beforeEach, afterEach, describe, expect, it } from 'bun:test'

import * as spawnAgentUtils from '../tools/handlers/tool/spawn-agent-utils'
import {
  resolveSubagentTimeoutMs,
  executeSubagent,
  createCombinedAbortSignal,
} from '../tools/handlers/tool/spawn-agent-utils'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'
import {
  createTestAgentRuntimeParams,
  testFileContext,
} from '@codebuff/common/testing/fixtures/agent-runtime'
import { getInitialAgentState } from '@codebuff/common/types/session-state'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'test-agent',
    displayName: 'Test Agent',
    toolNames: [],
    spawnableAgents: [],
    mcpServers: {},
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
    includeMessageHistory: false,
    inheritParentSystemPrompt: false,
    outputMode: 'last_message',
    inputSchema: {},
    ...overrides,
  } as AgentTemplate
}

describe('resolveSubagentTimeoutMs', () => {
  it('uses the explicit per-spawn override when provided', () => {
    const tpl = makeTemplate({ defaultTimeoutMs: 5 * 60 * 1000 })
    expect(resolveSubagentTimeoutMs(tpl, 30 * 1000)).toBe(30 * 1000)
  })

  it('falls back to the agent template defaultTimeoutMs when no override', () => {
    const tpl = makeTemplate({ defaultTimeoutMs: 5 * 60 * 1000 })
    expect(resolveSubagentTimeoutMs(tpl, undefined)).toBe(5 * 60 * 1000)
  })

  it('falls back to DEFAULT_SUBAGENT_TIMEOUT_MS (20 min) when neither is set', () => {
    const tpl = makeTemplate()
    expect(resolveSubagentTimeoutMs(tpl, undefined)).toBe(20 * 60 * 1000)
  })

  it('override takes precedence over template default even when default is -1', () => {
    const tpl = makeTemplate({ defaultTimeoutMs: -1 })
    expect(resolveSubagentTimeoutMs(tpl, 1000)).toBe(1000)
  })

  it('template default of -1 (no timeout) is respected when no override', () => {
    const tpl = makeTemplate({ defaultTimeoutMs: -1 })
    expect(resolveSubagentTimeoutMs(tpl, undefined)).toBe(-1)
  })

  it('explicit override of -1 (no timeout) is respected', () => {
    const tpl = makeTemplate({ defaultTimeoutMs: 5 * 60 * 1000 })
    expect(resolveSubagentTimeoutMs(tpl, -1)).toBe(-1)
  })
})

describe('withTimeout abort support', () => {
  it('aborts the controller on deadline before rejecting', async () => {
    const controller = new AbortController()
    const slow = new Promise<string>(() => {}) // never resolves
    await expect(
      withTimeout(slow, 20, 'boom', { controller }),
    ).rejects.toThrow('boom')
    expect(controller.signal.aborted).toBe(true)
  })

  it('does NOT abort the controller when the promise resolves first', async () => {
    const controller = new AbortController()
    await withTimeout(Promise.resolve('ok'), 1000, 'boom', { controller })
    expect(controller.signal.aborted).toBe(false)
  })

  it('non-positive timeoutMs disables the timer and returns the promise result', async () => {
    const controller = new AbortController()
    const result = await withTimeout(
      Promise.resolve('done'),
      0,
      'should-not-fire',
      { controller },
    )
    expect(result).toBe('done')
    expect(controller.signal.aborted).toBe(false)
  })

  it('timeoutMs = -1 disables the timer (no timeout)', async () => {
    const controller = new AbortController()
    const result = await withTimeout(
      Promise.resolve('done'),
      -1,
      'should-not-fire',
      { controller },
    )
    expect(result).toBe('done')
    expect(controller.signal.aborted).toBe(false)
  })

  it('omitting the controller behaves like the old API (no abort side-effect)', async () => {
    const slow = new Promise<string>(() => {})
    await expect(withTimeout(slow, 20, 'boom')).rejects.toThrow('boom')
  })
})

describe('spawn_agents timeout_seconds override wiring', () => {
  let mockAgentTemplate: AgentTemplate
  let baseParams: any

  beforeEach(() => {
    mockAgentTemplate = makeTemplate({
      id: 'test-agent',
      displayName: 'Test Agent',
      spawnableAgents: ['test-agent'],
    })
    baseParams = {
      ...createTestAgentRuntimeParams(),
      agentTemplate: mockAgentTemplate,
      agentState: getInitialAgentState(),
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: testFileContext,
      localAgentTemplates: { 'test-agent': mockAgentTemplate },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any,
      system: '',
      tools: {},
      userId: undefined,
      userInputId: 'u',
      sendSubagentChunk: () => {},
      writeToClient: () => {},
    }
  })

  afterEach(() => {
    spyOn(spawnAgentUtils, 'executeSubagent').mockRestore?.()
  })

  it('passes timeout_seconds (seconds → ms) as subagentTimeoutMs to executeSubagent', async () => {
    const spy = spyOn(spawnAgentUtils, 'executeSubagent').mockResolvedValue({
      agentState: { ...getInitialAgentState(), agentId: 'sub' },
      output: { type: 'lastMessage' as const, value: [] },
    } as any)

    await handleSpawnAgents({
      ...baseParams,
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'c1',
        input: {
          agents: [
            {
              agent_type: 'test-agent',
              prompt: 'do thing',
              timeout_seconds: 120,
            },
          ],
        },
      } as any,
    } as any)

    expect(spy).toHaveBeenCalledTimes(1)
    const passedTimeout = spy.mock.calls[0][0].subagentTimeoutMs
    expect(passedTimeout).toBe(120 * 1000)
  })

  it('passes undefined when timeout_seconds is omitted (template default applies)', async () => {
    const spy = spyOn(spawnAgentUtils, 'executeSubagent').mockResolvedValue({
      agentState: { ...getInitialAgentState(), agentId: 'sub' },
      output: { type: 'lastMessage' as const, value: [] },
    } as any)

    await handleSpawnAgents({
      ...baseParams,
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'c1',
        input: {
          agents: [{ agent_type: 'test-agent', prompt: 'do thing' }],
        },
      } as any,
    } as any)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].subagentTimeoutMs).toBeUndefined()
  })

  it('passes -1 → -1000 ms when timeout_seconds is -1 (no timeout)', async () => {
    const spy = spyOn(spawnAgentUtils, 'executeSubagent').mockResolvedValue({
      agentState: { ...getInitialAgentState(), agentId: 'sub' },
      output: { type: 'lastMessage' as const, value: [] },
    } as any)

    await handleSpawnAgents({
      ...baseParams,
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'c1',
        input: {
          agents: [
            {
              agent_type: 'test-agent',
              prompt: 'long thing',
              timeout_seconds: -1,
            },
          ],
        },
      } as any,
    } as any)

    expect(spy).toHaveBeenCalledTimes(1)
    // -1 seconds → -1000 ms, which resolveSubagentTimeoutMs treats as
    // no-timeout (non-positive).
    expect(spy.mock.calls[0][0].subagentTimeoutMs).toBe(-1000)
  })

  it('applies the same override to background (detached) spawns', async () => {
    const spy = spyOn(spawnAgentUtils, 'executeSubagent').mockResolvedValue({
      agentState: { ...getInitialAgentState(), agentId: 'sub' },
      output: { type: 'lastMessage' as const, value: [] },
    } as any)

    await handleSpawnAgents({
      ...baseParams,
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'c1',
        input: {
          agents: [
            {
              agent_type: 'test-agent',
              prompt: 'bg thing',
              background: true,
              timeout_seconds: 300,
            },
          ],
        },
      } as any,
    } as any)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].subagentTimeoutMs).toBe(300 * 1000)
  })
})

describe('createCombinedAbortSignal (AbortSignal.any fallback)', () => {
  it('is not aborted when neither input is aborted', () => {
    const a = new AbortController().signal
    const b = new AbortController().signal
    const combined = createCombinedAbortSignal(a, b)
    expect(combined.aborted).toBe(false)
  })

  it('fires when the first input aborts, propagating its reason', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = createCombinedAbortSignal(a.signal, b.signal)
    const reason = new Error('a fired')
    a.abort(reason)
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe(reason)
  })

  it('fires when the second input aborts, propagating its reason', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = createCombinedAbortSignal(a.signal, b.signal)
    const reason = new Error('b fired')
    b.abort(reason)
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe(reason)
  })

  it('is immediately aborted when the first input is already aborted upfront', () => {
    const a = new AbortController()
    const reason = new Error('already gone')
    a.abort(reason)
    const b = new AbortController().signal
    const combined = createCombinedAbortSignal(a.signal, b)
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe(reason)
  })

  it('is immediately aborted when the second input is already aborted upfront', () => {
    const a = new AbortController().signal
    const b = new AbortController()
    const reason = new Error('b already gone')
    b.abort(reason)
    const combined = createCombinedAbortSignal(a, b.signal)
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe(reason)
  })

  it('prefers the first input reason when both are already aborted', () => {
    const a = new AbortController()
    const aReason = new Error('a reason')
    a.abort(aReason)
    const b = new AbortController()
    b.abort(new Error('b reason'))
    const combined = createCombinedAbortSignal(a.signal, b.signal)
    expect(combined.aborted).toBe(true)
    // The fallback checks `a` first, so a's reason wins.
    expect(combined.reason).toBe(aReason)
  })

  it('stays aborted and does not throw when listeners fire after combination', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = createCombinedAbortSignal(a.signal, b.signal)
    a.abort(new Error('first'))
    // Firing the second after the first should not throw or change the reason.
    expect(() => b.abort(new Error('second'))).not.toThrow()
    expect(combined.aborted).toBe(true)
  })

  it('does not abort the source controllers (one-way bridge)', () => {
    const a = new AbortController()
    const b = new AbortController()
    createCombinedAbortSignal(a.signal, b.signal)
    // The combined signal is a new controller; aborting IT (if we had it) would
    // not affect the sources. Here we just confirm the sources are untouched
    // after combination with no aborts.
    expect(a.signal.aborted).toBe(false)
    expect(b.signal.aborted).toBe(false)
  })
})

