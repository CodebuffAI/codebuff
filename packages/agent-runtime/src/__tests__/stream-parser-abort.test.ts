import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { AbortError, isAbortError } from '@codebuff/common/util/error'
import { beforeEach, describe, expect, it } from 'bun:test'

import { mockFileContext } from './test-utils'
import { processStream } from '../tools/stream-parser'

import type { AgentTemplate } from '../templates/types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { AssistantMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { PromptResult } from '@codebuff/common/util/error'

describe('stream parser abort handling', () => {
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

  function getAssistantText(messageHistory: { role: string; content: { type: string; text?: string }[] }[]): string[] {
    return messageHistory
      .filter((m): m is AssistantMessage => m.role === 'assistant')
      .flatMap((m) => m.content)
      .filter((c) => c.type === 'text')
      .map((c) => ('text' in c ? c.text! : ''))
  }

  it('preserves unflushed buffer text in message history when stream throws AbortError', async () => {
    const abortController = new AbortController()

    // The stream yields text chunks that get buffered in processStreamWithTools.
    // Since no tool call arrives after the text, the buffer is never flushed
    // normally. The try/finally in processStreamWithTools should flush it on abort.
    async function* mockStream(): AsyncGenerator<StreamChunk, PromptResult<string | null>> {
      yield { type: 'text' as const, text: 'Hello ' }
      yield { type: 'text' as const, text: 'world' }
      abortController.abort()
      throw new AbortError()
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    let thrownError: unknown
    try {
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
        stream: mockStream(),
        system: 'test system',
        tools: {},
        userId: 'test-user',
        userInputId: 'test-input-id',
        onCostCalculated: async () => {},
        onResponseChunk: () => {},
      })
    } catch (error) {
      thrownError = error
    }

    expect(isAbortError(thrownError)).toBe(true)

    // The buffered text "Hello world" should be preserved in message history
    // via the try/finally flush in processStreamWithTools
    const textParts = getAssistantText(agentState.messageHistory)
    expect(textParts.join('')).toBe('Hello world')
  })

  it('preserves text buffered after a tool call when stream throws AbortError', async () => {
    const abortController = new AbortController()

    // Text before tool call gets flushed when the tool call arrives.
    // Text after the tool call sits in the buffer and is only flushed
    // by the try/finally on abort.
    async function* mockStream(): AsyncGenerator<StreamChunk, PromptResult<string | null>> {
      yield { type: 'text' as const, text: 'Analyzing code...' }
      yield {
        type: 'tool-call' as const,
        toolName: 'read_files',
        toolCallId: 'tc-1',
        input: { paths: ['test.ts'] },
      }
      yield { type: 'text' as const, text: 'Now editing the file' }
      abortController.abort()
      throw new AbortError()
    }

    agentRuntimeImpl.requestFiles = async () => ({
      'test.ts': 'console.log("test")',
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    let thrownError: unknown
    try {
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
        stream: mockStream(),
        system: 'test system',
        tools: {},
        userId: 'test-user',
        userInputId: 'test-input-id',
        onCostCalculated: async () => {},
        onResponseChunk: () => {},
      })
    } catch (error) {
      thrownError = error
    }

    expect(isAbortError(thrownError)).toBe(true)

    // Both text segments should be in message history:
    // - "Analyzing code..." was flushed when the tool call arrived
    // - "Now editing the file" was in the unflushed buffer, flushed by try/finally
    const textParts = getAssistantText(agentState.messageHistory)
    expect(textParts).toContain('Analyzing code...')
    expect(textParts).toContain('Now editing the file')
  })

  it('flushes buffer on cooperative abort via signal.aborted check', async () => {
    const abortController = new AbortController()

    // Stream yields text, then abort fires between iterations.
    // processStreamWithTools pulls the next chunk (which triggers the abort),
    // but the signal.aborted check at the top of the outer loop breaks before
    // the next iteration. streamWithTags.return() triggers the generator's
    // finally → flush(), preserving all buffered text.
    async function* mockStream(): AsyncGenerator<StreamChunk, PromptResult<string | null>> {
      yield { type: 'text' as const, text: 'Starting ' }
      yield { type: 'text' as const, text: 'analysis' }
      abortController.abort()
      yield { type: 'text' as const, text: '... more text' }
      return { aborted: true }
    }

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    let thrownError: unknown
    try {
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
        stream: mockStream(),
        system: 'test system',
        tools: {},
        userId: 'test-user',
        userInputId: 'test-input-id',
        onCostCalculated: async () => {},
        onResponseChunk: () => {},
      })
    } catch (error) {
      thrownError = error
    }

    expect(isAbortError(thrownError)).toBe(true)

    // All text that was buffered should be preserved.
    // The streamWithTags.return() call triggers the generator's finally → flush().
    const textParts = getAssistantText(agentState.messageHistory)
    const allText = textParts.join('')
    expect(allText).toContain('Starting ')
    expect(allText).toContain('analysis')
    expect(allText).toContain('... more text')
  })
})
