import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage } from '@codebuff/common/util/messages'
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { mockFileContext } from './test-utils'
import * as runAgentStep from '../run-agent-step'
import { handleSpawnAgentInline } from '../tools/handlers/tool/spawn-agent-inline'
import { getMatchingSpawn } from '../tools/handlers/tool/spawn-agent-utils'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

describe('Spawn Agents Permissions', () => {
  let handleSpawnAgentsBaseParams: ParamsExcluding<
    typeof handleSpawnAgents,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >
  let handleSpawnAgentInlineBaseParams: ParamsExcluding<
    typeof handleSpawnAgentInline,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >

  const createMockAgent = (
    id: string,
    spawnableAgents: string[] = [],
  ): AgentTemplate => ({
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
    spawnableAgents,
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  })

  beforeEach(() => {
    handleSpawnAgentsBaseParams = {
      ...TEST_AGENT_RUNTIME_IMPL,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      previousToolCallFinished: Promise.resolve(),
      repoId: undefined,
      repoUrl: undefined,
      sendSubagentChunk: mock(() => {}),
      signal: new AbortController().signal,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      writeToClient: () => {},
    }
    handleSpawnAgentInlineBaseParams = {
      ...handleSpawnAgentsBaseParams,
      tools: {},
    }
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(async (options) => ({
      agentState: {
        ...options.agentState,
        messageHistory: [assistantMessage('Mock agent response')],
      },
      output: {
        type: 'lastMessage',
        value: [assistantMessage('Mock agent response')],
      },
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('matches underscored agent names to hyphenated spawnable agents', () => {
    expect(getMatchingSpawn(['file-picker'], 'file_picker')).toBe('file-picker')
    expect(getMatchingSpawn(['codebuff/file-picker@1.0.0'], 'file_picker')).toBe(
      'codebuff/file-picker@1.0.0',
    )
  })

  it('allows spawning when the child agent is spawnable', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('thinker')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents',
      toolCallId: 'spawn-thinker',
      input: { agents: [{ agent_type: 'thinker', prompt: 'Think' }] },
    }

    const { output } = await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { thinker: childAgent },
      toolCall,
    })

    expect(JSON.stringify(output)).toContain('Mock agent response')
  })

  it('rejects inline spawning when the child agent is not spawnable', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('reviewer')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agent_inline'> = {
      toolName: 'spawn_agent_inline',
      toolCallId: 'spawn-reviewer',
      input: { agent_type: 'reviewer', prompt: 'Review' },
    }

    await expect(
      handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { reviewer: childAgent },
        toolCall,
      }),
    ).rejects.toThrow('is not allowed to spawn child agent type reviewer')
  })
})
