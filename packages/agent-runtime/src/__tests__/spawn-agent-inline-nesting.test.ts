import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import * as runAgentStep from '../run-agent-step'
import { mockFileContext } from './test-utils'
import { handleSpawnAgentInline } from '../tools/handlers/tool/spawn-agent-inline'
import { normalizeSpawnedAgentOutput } from '../tools/handlers/tool/spawn-agent-utils'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

/**
 * Filters the writeToClient mock's captured calls, returning only the
 * PrintModeEvent objects (dropping plain-string chunks like "Thinking...").
 */
function capturedEventChunks(
  calls: ReturnType<typeof mock>['mock']['calls'],
): PrintModeEvent[] {
  return calls
    .map((args) => args[0])
    .filter((chunk): chunk is PrintModeEvent => typeof chunk !== 'string')
}

const createMockAgent = (id: string): AgentTemplate => ({
  id,
  displayName: `Mock ${id}`,
  outputMode: 'last_message' as const,
  inputSchema: {
    prompt: {
      safeParse: () => ({ success: true }),
    } as unknown as AgentTemplate['inputSchema']['prompt'],
  },
  spawnerPrompt: '',
  model: '',
  includeMessageHistory: true,
  inheritParentSystemPrompt: false,
  mcpServers: {},
  toolNames: [],
  spawnableAgents: [],
  systemPrompt: '',
  instructionsPrompt: '',
  stepPrompt: '',
})

const createInlineToolCall = (
  agentType: string,
  prompt = 'test prompt',
): CodebuffToolCall<'spawn_agent_inline'> => ({
  toolName: 'spawn_agent_inline' as const,
  toolCallId: 'inline-tool-call-id',
  input: { agent_type: agentType, prompt },
})

describe('spawn_agent_inline onResponseChunk parentAgentId nesting', () => {
  let writeToClient: ReturnType<typeof mock>
  let capturedChildAgentId: string | undefined
  let capturedParentAgentId: string | undefined
  let handleSpawnAgentInlineBaseParams: ParamsExcluding<
    typeof handleSpawnAgentInline,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >

  beforeEach(() => {
    writeToClient = mock(() => {})
    capturedChildAgentId = undefined
    capturedParentAgentId = undefined

    handleSpawnAgentInlineBaseParams = {
      ...TEST_AGENT_RUNTIME_IMPL,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      repoId: undefined,
      repoUrl: undefined,
      previousToolCallFinished: Promise.resolve(),
      sendSubagentChunk: mock(() => {}),
      signal: new AbortController().signal,
      system: 'Test system prompt',
      tools: {},
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      writeToClient,
    } as unknown as ParamsExcluding<
      typeof handleSpawnAgentInline,
      'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
    >
  })

  afterEach(() => {
    mock.restore()
  })

  /**
   * Runs the inline spawn handler with a mocked loopAgentSteps that emits the
   * provided child chunk events through options.onResponseChunk before
   * returning. Returns the captured PrintModeEvents written to the client.
   */
  async function runInlineSpawnWithChildEvents(
    agentType: string,
    childChunks: PrintModeEvent[],
  ): Promise<PrintModeEvent[]> {
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        capturedChildAgentId = options.agentState.agentId
        for (const chunk of childChunks) {
          options.onResponseChunk?.(chunk)
        }
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [] },
        }
      },
    )

    const parentAgent = {
      ...createMockAgent('parent'),
      // The parent must be allowed to spawn the child agent type.
      spawnableAgents: ['test-writer', 'context-pruner'],
      toolNames: ['spawn_agent_inline'],
    }
    const childAgent = createMockAgent(agentType)
    const sessionState = getInitialSessionState(mockFileContext)
    capturedParentAgentId = sessionState.mainAgentState.agentId

    await handleSpawnAgentInline({
      ...handleSpawnAgentInlineBaseParams,
      tools: {},
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { [agentType]: childAgent },
      toolCall: createInlineToolCall(agentType),
    })

    return capturedEventChunks(writeToClient.mock.calls)
  }

  it('nests tool_call events inside the child agent block via parentAgentId', async () => {
    const toolCallEvent: PrintModeEvent = {
      type: 'tool_call',
      toolCallId: 'child-tool-1',
      toolName: 'read_files',
      input: { paths: ['foo.ts'] },
    }

    const events = await runInlineSpawnWithChildEvents('test-writer', [
      toolCallEvent,
    ])

    const toolCalls = events.filter((e) => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(1)
    expect(capturedChildAgentId).toBeTruthy()

    // The fix: tool_call events must carry parentAgentId = child's agentId so
    // the CLI's handleRegularToolCall nests them INSIDE the child agent block,
    // not the orchestrator's block.
    const tc = toolCalls[0] as Extract<PrintModeEvent, { type: 'tool_call' }>
    expect(tc.parentAgentId).toBe(capturedChildAgentId)
    expect(tc.parentAgentId).not.toBe(capturedParentAgentId)
  })

  it('preserves a pre-existing tool_call parentAgentId for deep inline-nesting (reviewer finding 2)', async () => {
    // When a programmatic inline child itself spawns an inline grandchild,
    // run-programmatic-step.ts sets parentAgentId on the grandchild's tool_call
    // events to the grandchild's intending-parent id (NOT the child's). The
    // inline handler must preserve that pre-existing lineage via
    // `chunk.parentAgentId ?? childAgentState.agentId` instead of
    // unconditionally overwriting it. Without the fix, a grandchild's tool
    // calls would be mis-nested under the child, breaking deep nesting.
    const grandchildParentId = 'grandchild-intended-parent-id'
    const toolCallEvent: PrintModeEvent = {
      type: 'tool_call',
      toolCallId: 'grandchild-tool-1',
      toolName: 'read_files',
      input: { paths: ['bar.ts'] },
      parentAgentId: grandchildParentId,
    }

    const events = await runInlineSpawnWithChildEvents('test-writer', [
      toolCallEvent,
    ])

    const toolCalls = events.filter((e) => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(1)

    const tc = toolCalls[0] as Extract<PrintModeEvent, { type: 'tool_call' }>
    // The pre-existing parentAgentId must be preserved, NOT overwritten with
    // capturedChildAgentId (the behavior the reviewer flagged).
    expect(tc.parentAgentId).toBe(grandchildParentId)
    expect(tc.parentAgentId).not.toBe(capturedChildAgentId)
  })

  it('nests tool_result events inside the child agent block via parentAgentId', async () => {
    const toolResultEvent: PrintModeEvent = {
      type: 'tool_result',
      toolCallId: 'child-tool-1',
      toolName: 'read_files',
      output: [{ type: 'json', value: 'ok' }],
    }

    const events = await runInlineSpawnWithChildEvents('test-writer', [
      toolResultEvent,
    ])

    const toolResults = events.filter((e) => e.type === 'tool_result')
    expect(toolResults).toHaveLength(1)

    const tr = toolResults[0] as Extract<
      PrintModeEvent,
      { type: 'tool_result' }
    >
    expect(tr.parentAgentId).toBe(capturedChildAgentId)
    expect(tr.parentAgentId).not.toBe(capturedParentAgentId)
  })

  it("tags text events with the child's agentId so prose attributes to the child block", async () => {
    // Reviewer finding: spawn_agents has a dedicated text branch that sets
    // agentId = subAgentState.agentId. The inline handler must do the same so
    // child prose doesn't render as if the orchestrator wrote it.
    const textEvent: PrintModeEvent = {
      type: 'text',
      text: 'I am the child agent writing prose.',
    }

    const events = await runInlineSpawnWithChildEvents('test-writer', [
      textEvent,
    ])

    const texts = events.filter((e) => e.type === 'text')
    expect(texts).toHaveLength(1)
    const text = texts[0] as Extract<PrintModeEvent, { type: 'text' }>
    expect(text.agentId).toBe(capturedChildAgentId)
    expect(text.agentId).not.toBe(capturedParentAgentId)
    expect(text.text).toBe('I am the child agent writing prose.')
  })

  it('preserves a pre-existing text agentId for deep inline-nesting (grandchild attribution)', async () => {
    // When a programmatic inline child itself spawns an inline grandchild,
    // run-programmatic-step.ts sets agentId on the grandchild's text events
    // to the grandchild's own id (NOT the child's). The inline handler must
    // preserve that pre-existing attribution via
    // `chunk.agentId ?? childAgentState.agentId` instead of unconditionally
    // retagging with the child's id. Without the fix, a grandchild's prose
    // would be mis-attributed to the child in the TUI.
    const grandchildAgentId = 'grandchild-text-author-id'
    const textEvent: PrintModeEvent = {
      type: 'text',
      text: 'I am the grandchild agent writing prose.',
      agentId: grandchildAgentId,
    }

    const events = await runInlineSpawnWithChildEvents('test-writer', [
      textEvent,
    ])

    const texts = events.filter((e) => e.type === 'text')
    expect(texts).toHaveLength(1)
    const text = texts[0] as Extract<PrintModeEvent, { type: 'text' }>
    // The pre-existing agentId must be preserved, NOT overwritten with
    // capturedChildAgentId.
    expect(text.agentId).toBe(grandchildAgentId)
    expect(text.agentId).not.toBe(capturedChildAgentId)
  })

  it('drops empty text events (matches spawn_agents text-injection guard)', async () => {
    // spawn_agents only forwards text when chunk.text is truthy; the inline
    // handler mirrors the same guard so empty text fragments aren't sent.
    const events = await runInlineSpawnWithChildEvents('test-writer', [
      { type: 'text', text: '' },
    ])

    const texts = events.filter((e) => e.type === 'text')
    expect(texts).toHaveLength(0)
  })

  it('forwards subagent_start with parentAgentId set to the parent orchestrator (not the child)', async () => {
    // executeSubagent emits subagent_start itself with parentAgentId already
    // set to parentAgentState.agentId. The onResponseChunk callback must
    // preserve / fall back to that parent id (not override it with the child's id).
    const events = await runInlineSpawnWithChildEvents('test-writer', [])

    const starts = events.filter((e) => e.type === 'subagent_start')
    expect(starts).toHaveLength(1)

    const start = starts[0] as Extract<
      PrintModeEvent,
      { type: 'subagent_start' }
    >
    expect(start.parentAgentId).toBe(capturedParentAgentId)
    expect(start.parentAgentId).not.toBe(capturedChildAgentId)
  })

  it('forwards subagent_finish with parentAgentId set to the parent orchestrator', async () => {
    const events = await runInlineSpawnWithChildEvents('test-writer', [])

    const finishes = events.filter((e) => e.type === 'subagent_finish')
    expect(finishes).toHaveLength(1)

    const finish = finishes[0] as Extract<
      PrintModeEvent,
      { type: 'subagent_finish' }
    >
    expect(finish.parentAgentId).toBe(capturedParentAgentId)
    expect(finish.parentAgentId).not.toBe(capturedChildAgentId)
  })

  it('passes through non-nesting PrintModeEvent types unchanged (no parentAgentId injection)', async () => {
    // reasoning_delta does not carry an optional parentAgentId field; the
    // callback must forward it verbatim and not inject extra fields.
    const reasoningDelta: PrintModeEvent = {
      type: 'reasoning_delta',
      text: 'hmm',
      ancestorRunIds: [],
      runId: 'run-1',
    }

    const events = await runInlineSpawnWithChildEvents('test-writer', [
      reasoningDelta,
    ])

    const deltas = events.filter((e) => e.type === 'reasoning_delta')
    expect(deltas).toHaveLength(1)
    const delta = deltas[0] as Extract<
      PrintModeEvent,
      { type: 'reasoning_delta' }
    >
    expect(delta).toEqual(reasoningDelta)
  })

  it('suppresses ALL events when agentType is context-pruner (silent-pruner regression guard)', async () => {
    // The context-pruner branch is gated before the nesting logic: nothing
    // should reach writeToClient. executeSubagent's own start/finish events
    // go through the SAME onResponseChunk closure, so they get silenced too.
    const childChunks: PrintModeEvent[] = [
      {
        type: 'tool_call',
        toolCallId: 'pruner-tool-1',
        toolName: 'read_files',
        input: { paths: ['a.ts'] },
      },
      {
        type: 'tool_result',
        toolCallId: 'pruner-tool-1',
        toolName: 'read_files',
        output: [{ type: 'json', value: 'ok' }],
      },
    ]

    const events = await runInlineSpawnWithChildEvents(
      'context-pruner',
      childChunks,
    )

    expect(events).toHaveLength(0)
  })

  it('forwards plain string chunks verbatim (not wrapped or altered)', async () => {
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        options.onResponseChunk?.('plain text fragment')
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [] },
        }
      },
    )

    const parentAgent = {
      ...createMockAgent('parent'),
      spawnableAgents: ['test-writer'],
      toolNames: ['spawn_agent_inline'],
    }
    const childAgent = createMockAgent('test-writer')
    const sessionState = getInitialSessionState(mockFileContext)

    await handleSpawnAgentInline({
      ...handleSpawnAgentInlineBaseParams,
      tools: {},
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { 'test-writer': childAgent },
      toolCall: createInlineToolCall('test-writer'),
    })

    const allChunks = writeToClient.mock.calls.map((args) => args[0])
    const stringChunks = allChunks.filter(
      (c): c is string => typeof c === 'string',
    )
    expect(stringChunks).toContain('plain text fragment')
  })

  it('nests a mixed tool_call + tool_result sequence under the child id consistently', async () => {
    const childChunks: PrintModeEvent[] = [
      {
        type: 'tool_call',
        toolCallId: 'mixed-1',
        toolName: 'read_files',
        input: { paths: ['a.ts'] },
      },
      {
        type: 'tool_result',
        toolCallId: 'mixed-1',
        toolName: 'read_files',
        output: [{ type: 'json', value: 'content' }],
      },
      {
        type: 'tool_call',
        toolCallId: 'mixed-2',
        toolName: 'code_search',
        input: { pattern: 'foo' },
      },
    ]

    const events = await runInlineSpawnWithChildEvents(
      'test-writer',
      childChunks,
    )

    const nested = events.filter(
      (e) => e.type === 'tool_call' || e.type === 'tool_result',
    )
    expect(nested).toHaveLength(3)
    for (const ev of nested) {
      expect((ev as { parentAgentId?: string }).parentAgentId).toBe(
        capturedChildAgentId,
      )
    }
    expect(capturedChildAgentId).not.toBe(capturedParentAgentId)
  })

  it('does not copy ordinary inline-agent private history back to the parent', async () => {
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        options.agentState.messageHistory = [
          ...options.agentState.messageHistory,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'private child analysis' }],
          },
          {
            role: 'tool',
            toolName: 'read_files',
            toolCallId: 'private-read',
            content: [{ type: 'json', value: 'large private file body' }],
          },
        ]
        return {
          agentState: options.agentState,
          output: { type: 'structuredOutput', value: { message: 'done' } },
        }
      },
    )

    const parentAgent = {
      ...createMockAgent('parent'),
      spawnableAgents: ['test-writer'],
      toolNames: ['spawn_agent_inline'],
    }
    const childAgent = createMockAgent('test-writer')
    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.messageHistory = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'original parent request' }],
      },
    ]
    const originalHistory = [...sessionState.mainAgentState.messageHistory]

    await handleSpawnAgentInline({
      ...handleSpawnAgentInlineBaseParams,
      tools: {},
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { 'test-writer': childAgent },
      toolCall: createInlineToolCall('test-writer'),
    })

    expect(sessionState.mainAgentState.messageHistory).toEqual(originalHistory)
  })

  it('still applies context-pruner history updates to the parent', async () => {
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        options.agentState.messageHistory = [
          {
            role: 'user',
            content: [{ type: 'text', text: 'compacted parent memory' }],
          },
        ]
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [] },
        }
      },
    )

    const parentAgent = {
      ...createMockAgent('parent'),
      spawnableAgents: ['context-pruner'],
      toolNames: ['spawn_agent_inline'],
    }
    const childAgent = createMockAgent('context-pruner')
    const sessionState = getInitialSessionState(mockFileContext)

    await handleSpawnAgentInline({
      ...handleSpawnAgentInlineBaseParams,
      tools: {},
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { 'context-pruner': childAgent },
      toolCall: createInlineToolCall('context-pruner'),
    })

    expect(sessionState.mainAgentState.messageHistory).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'compacted parent memory' }],
      },
    ])
  })

  it('bounds reviewer evidence before returning it to the parent history', () => {
    const longEvidence = `prefix-${'x'.repeat(600)}-suffix`
    const normalized = normalizeSpawnedAgentOutput({
      type: 'structuredOutput',
      value: {
        schemaVersion: 1,
        family: 'reviewer',
        verdict: 'BLOCKING',
        findings: [
          {
            id: 'reviewer:dimension:finding',
            severity: 'high',
            evidence: [longEvidence, 'second', 'third', 'fourth'],
          },
        ],
        requirementCoverage: [
          {
            requirement: 'Keep context bounded',
            status: 'missing',
            evidence: ['one', 'two', 'three'],
          },
        ],
      },
    }) as any

    const findingEvidence = normalized.value.findings[0].evidence
    expect(findingEvidence).toHaveLength(3)
    expect(findingEvidence[0]).toContain('[truncated]')
    expect(findingEvidence[0]).toContain('prefix-')
    expect(findingEvidence[0]).toContain('-suffix')
    expect(normalized.value.requirementCoverage[0].evidence).toEqual([
      'one',
      'two',
    ])
  })
})
