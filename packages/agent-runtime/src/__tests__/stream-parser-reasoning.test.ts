import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { beforeEach, describe, expect, it } from 'bun:test'

import { mockFileContext } from './test-utils'
import { INCLUDE_REASONING_IN_MESSAGE_HISTORY } from '../constants'
import { processStream } from '../tools/stream-parser'

import type { AgentTemplate } from '../templates/types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type {
  AssistantMessage,
  Message,
} from '@codebuff/common/types/messages/codebuff-message'
import type { PromptResult } from '@codebuff/common/util/error'

describe.skipIf(!INCLUDE_REASONING_IN_MESSAGE_HISTORY)('stream parser reasoning history', () => {
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL, sendAction: () => {} }
  })

  const testAgentTemplate: AgentTemplate = {
    id: 'test-agent',
    displayName: 'Test Agent',
    spawnerPrompt: 'Test agent',
    model: 'claude-3-5-sonnet-20241022',
    inputSchema: {},
    outputMode: 'structured_output',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: ['read_files', 'end_turn'],
    spawnableAgents: [],
    systemPrompt: 'Test system prompt',
    instructionsPrompt: 'Test instructions',
    stepPrompt: 'Test step prompt',
  }

  function getReasoningParts(messageHistory: Message[]): string[] {
    return messageHistory
      .filter((m): m is AssistantMessage => m.role === 'assistant')
      .flatMap((m) => m.content)
      .filter((c) => c.type === 'reasoning')
      .map((c) => ('text' in c ? c.text : ''))
  }

  async function runStream(
    stream: AsyncGenerator<StreamChunk, PromptResult<string | null>>,
  ) {
    const abortController = new AbortController()
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    await processStream({
      ...agentRuntimeImpl,
      agentContext: {},
      agentState,
      agentStepId: 'test-step-id',
      agentTemplate: testAgentTemplate,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      fullResponse: '',
      localAgentTemplates: { 'test-agent': testAgentTemplate },
      messages: [],
      prompt: 'test prompt',
      repoId: undefined,
      repoUrl: undefined,
      runId: 'test-run-id',
      signal: abortController.signal,
      stream,
      system: 'test system',
      tools: {},
      userId: 'test-user',
      userInputId: 'test-input-id',
      onCostCalculated: async () => {},
      onResponseChunk: () => {},
    })

    return agentState.messageHistory
  }

  it('consolidates consecutive reasoning chunks into a single message', async () => {
    async function* mockStream(): AsyncGenerator<
      StreamChunk,
      PromptResult<string | null>
    > {
      yield { type: 'reasoning' as const, text: 'Let me think ' }
      yield { type: 'reasoning' as const, text: 'about this. ' }
      yield { type: 'reasoning' as const, text: 'I should...' }
      yield { type: 'text' as const, text: 'Here is my answer.' }
      return { aborted: false, value: 'msg-id' }
    }

    const history = await runStream(mockStream())
    const reasoningParts = getReasoningParts(history)

    expect(reasoningParts).toEqual(['Let me think about this. I should...'])
  })

  it('separates reasoning chunks split by a text chunk into distinct messages', async () => {
    async function* mockStream(): AsyncGenerator<
      StreamChunk,
      PromptResult<string | null>
    > {
      yield { type: 'reasoning' as const, text: 'First thought.' }
      yield { type: 'text' as const, text: 'Some output.' }
      yield { type: 'reasoning' as const, text: 'Second thought.' }
      yield { type: 'text' as const, text: 'More output.' }
      return { aborted: false, value: 'msg-id' }
    }

    const history = await runStream(mockStream())
    const reasoningParts = getReasoningParts(history)

    expect(reasoningParts).toEqual(['First thought.', 'Second thought.'])
  })

  it('drops empty reasoning chunks', async () => {
    async function* mockStream(): AsyncGenerator<
      StreamChunk,
      PromptResult<string | null>
    > {
      yield { type: 'reasoning' as const, text: '' }
      yield { type: 'reasoning' as const, text: 'real thought' }
      yield { type: 'reasoning' as const, text: '' }
      return { aborted: false, value: 'msg-id' }
    }

    const history = await runStream(mockStream())
    const reasoningParts = getReasoningParts(history)

    expect(reasoningParts).toEqual(['real thought'])
  })
})
