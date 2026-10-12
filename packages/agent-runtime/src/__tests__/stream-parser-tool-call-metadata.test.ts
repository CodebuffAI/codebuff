/**
 * A native tool call's provider metadata (Gemini 3's thought signature) must
 * reach the history's tool-call part, or the next request is refused with
 * "Function call is missing a thought_signature" (HTTP 400).
 */
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { describe, expect, it } from 'bun:test'

import { mockFileContext } from './test-utils'
import { processStream } from '../tools/stream-parser'

import type { AgentTemplate } from '../templates/types'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { PromptResult } from '@codebuff/common/util/error'

const template: AgentTemplate = {
  id: 'test-agent',
  displayName: 'Test Agent',
  spawnerPrompt: 'Test agent',
  model: 'gemini-3.5-flash-lite',
  inputSchema: {},
  outputMode: 'structured_output',
  includeMessageHistory: true,
  inheritParentSystemPrompt: false,
  mcpServers: {},
  toolNames: ['end_turn'],
  spawnableAgents: [],
  systemPrompt: 'Test system prompt',
  instructionsPrompt: 'Test instructions',
  stepPrompt: 'Test step prompt',
}

async function historyAfter(chunks: StreamChunk[]) {
  async function* stream(): AsyncGenerator<
    StreamChunk,
    PromptResult<string | null>
  > {
    for (const chunk of chunks) yield chunk
    return { aborted: false, value: 'msg-id' }
  }
  const agentState = getInitialSessionState(mockFileContext).mainAgentState
  agentState.messageHistory = []
  await processStream({
    ...TEST_AGENT_RUNTIME_IMPL,
    sendAction: () => {},
    agentContext: {},
    agentState,
    agentStepId: 'test-step-id',
    agentTemplate: template,
    ancestorRunIds: [],
    clientSessionId: 'test-session',
    fileContext: mockFileContext,
    fingerprintId: 'test-fingerprint',
    fullResponse: '',
    localAgentTemplates: { 'test-agent': template },
    messages: agentState.messageHistory,
    prompt: 'test prompt',
    repoId: undefined,
    repoUrl: undefined,
    runId: 'test-run-id',
    signal: new AbortController().signal,
    stream: stream(),
    system: 'test system',
    tools: {},
    userId: 'test-user',
    userInputId: 'test-input-id',
    streamFinishReason: () => 'tool_calls',
    onCostCalculated: async () => {},
    onResponseChunk: () => {},
  })
  return agentState.messageHistory.flatMap((message) =>
    message.role === 'assistant' && Array.isArray(message.content)
      ? message.content.filter((part) => part.type === 'tool-call')
      : [],
  )
}

describe('processStream — tool-call provider metadata', () => {
  it('stores the metadata a tool call arrived with on its history part', async () => {
    const providerOptions = {
      byok: {
        extra_content: { google: { thought_signature: 'sig-A' } },
        model: 'gemini-3.5-flash-lite',
      },
    }
    const calls = await historyAfter([
      {
        type: 'tool-call',
        toolCallId: 'provider-id',
        toolName: 'end_turn',
        input: {},
        providerOptions,
      },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ toolName: 'end_turn', providerOptions })
  })

  it('adds no metadata to a call that had none', async () => {
    const calls = await historyAfter([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'end_turn', input: {} },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toHaveProperty('providerOptions')
  })
})
