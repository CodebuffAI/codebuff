import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import * as runAgentStep from '../run-agent-step'
import { mockFileContext } from './test-utils'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'

import type { AgentTemplate } from '../templates/types'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'

describe('Subagent Streaming', () => {
  afterEach(() => {
    mock.restore()
  })

  it('sends subagent start and finish events during agent execution', async () => {
    const writeToClient = mock(() => {})
    const sendSubagentChunk = mock(() => {})
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(async (options) => {
      options.onResponseChunk?.('Thinking about the problem...')
      return {
        agentState: {
          ...options.agentState,
          messageHistory: [assistantMessage('Test response from subagent')],
        },
        output: {
          type: 'lastMessage',
          value: [assistantMessage('Test response from subagent')],
        },
      }
    })

    const childTemplate = {
      id: 'thinker',
      displayName: 'Thinker',
      outputMode: 'last_message',
      inputSchema: {
        prompt: {
          safeParse: () => ({ success: true }),
        } as unknown as AgentTemplate['inputSchema']['prompt'],
      },
      spawnerPrompt: '',
      model: '',
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      toolNames: [],
      spawnableAgents: [],
      systemPrompt: '',
      instructionsPrompt: '',
      stepPrompt: '',
      mcpServers: {},
    } satisfies AgentTemplate as AgentTemplate
    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['thinker'],
    } as unknown as AgentTemplate
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents',
      toolCallId: 'spawn-thinker',
      input: {
        agents: [{ agent_type: 'thinker', prompt: 'Think about this problem' }],
      },
    }

    await handleSpawnAgents({
      ...TEST_AGENT_RUNTIME_IMPL,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      previousToolCallFinished: Promise.resolve(),
      repoId: undefined,
      repoUrl: undefined,
      sendSubagentChunk,
      signal: new AbortController().signal,
      system: 'Test system prompt',
      tools: {},
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      writeToClient,
      agentState: sessionState.mainAgentState,
      agentTemplate: parentTemplate,
      localAgentTemplates: { thinker: childTemplate },
      toolCall,
    })

    expect(writeToClient).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subagent_start' }),
    )
    expect(writeToClient).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subagent_finish' }),
    )
    expect(sendSubagentChunk).toHaveBeenCalled()
  })
})
