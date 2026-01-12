
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { beforeEach, describe, expect, it } from 'bun:test'

import { loopAgentSteps } from '../run-agent-step'

import type { AgentTemplate } from '../templates/types'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { TextPart } from '@codebuff/common/types/messages/content-part'
import type { ProjectFileContext } from '@codebuff/common/util/file'

const mockFileContext: ProjectFileContext = {
  projectRoot: '/test',
  cwd: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  agentTemplates: {},
  customToolDefinitions: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
}

describe('Prompt Caching for Subagents with inheritParentSystemPrompt', () => {
  let mockLocalAgentTemplates: Record<string, AgentTemplate>
  let capturedMessages: Message[] = []
  let loopAgentStepsBaseParams: ParamsExcluding<
    typeof loopAgentSteps,
    | 'agentState'
    | 'userInputId'
    | 'prompt'
    | 'agentType'
    | 'parentSystemPrompt'
    | 'agentTemplate'
  >

  beforeEach(() => {
    capturedMessages = []

    // Setup mock agent templates
    mockLocalAgentTemplates = {
      parent: {
        id: 'parent',
        displayName: 'Parent Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'anthropic/claude-sonnet-4',
        includeMessageHistory: false,
        inheritParentSystemPrompt: false,
        mcpServers: {},
        toolNames: [],
        spawnableAgents: ['child'],
        systemPrompt: 'Parent agent system prompt for testing',
        instructionsPrompt: '',
        stepPrompt: '',
      } satisfies AgentTemplate,
      child: {
        id: 'child',
        displayName: 'Child Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'anthropic/claude-sonnet-4', // Same model as parent
        includeMessageHistory: false,
        inheritParentSystemPrompt: true, // Should inherit parent's system prompt
        mcpServers: {},
        toolNames: [],
        spawnableAgents: [],
        systemPrompt: '', // Must be empty when inheritParentSystemPrompt is true
        instructionsPrompt: '',
        stepPrompt: '',
      } satisfies AgentTemplate,
    }
    loopAgentStepsBaseParams = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      // Mock LLM API to capture messages and end turn immediately
      promptAiSdkStream: async function* (options) {
        // Capture the messages sent to the LLM
        capturedMessages = options.messages

        // Simulate immediate end turn
        yield {
          type: 'text' as const,
          text: 'Test response',
        }

        if (options.onCostCalculated) {
          await options.onCostCalculated(1)
        }

        return 'mock-message-id'
      },
      // Mock file operations
      requestFiles: async ({ filePaths }) => {
        const results: Record<string, string | null> = {}
        filePaths.forEach((path) => {
          results[path] = null
        })
        return results
      },
      requestToolCall: async () => ({
        output: [
          {
            type: 'json',
            value: 'Tool call success',
          },
        ],
      }),
      repoId: undefined,
      repoUrl: undefined,
      spawnParams: undefined,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: 'test-user-id',
      clientSessionId: 'test-session',
      ancestorRunIds: [],
      onResponseChunk: () => {},
      signal: new AbortController().signal,
    }
  })

  it('should inherit parent system prompt when inheritParentSystemPrompt is true', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Run parent agent first to establish system prompt
    const parentResult = await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-parent',
      prompt: 'Parent task',
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
    })

    // Capture parent's messages which include the system prompt
    const parentMessages = capturedMessages
    expect(parentMessages.length).toBeGreaterThan(0)
    expect(parentMessages[0].role).toBe('system')
    const parentSystemPrompt = (parentMessages[0].content[0] as TextPart).text
    expect(parentSystemPrompt).toContain(
      'Parent agent system prompt for testing',
    )

    // Now run child agent with inheritParentSystemPrompt and parentSystemPrompt
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'child' as const,
      messageHistory: [],
    }

    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-child',
      prompt: 'Child task',
      agentType: 'child',
      agentState: childAgentState,
      parentSystemPrompt: parentSystemPrompt,
    })

    // Verify child uses parent's system prompt
    const childMessages = capturedMessages
    expect(childMessages.length).toBeGreaterThan(0)
    expect(childMessages[0].role).toBe('system')
    expect(
      childMessages[0].content[0].type === 'text' &&
        childMessages[0].content[0].text,
    ).toBe(parentSystemPrompt)
  })

  it('should generate own system prompt when inheritParentSystemPrompt is false', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Create a child agent that does NOT inherit parent system prompt
    const standaloneChild: AgentTemplate = {
      id: 'standalone-child',
      displayName: 'Standalone Child',
      outputMode: 'last_message',
      inputSchema: {},
      spawnerPrompt: '',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: [],
      spawnableAgents: [],
      systemPrompt: 'Standalone child system prompt',
      instructionsPrompt: '',
      stepPrompt: '',
    }

    mockLocalAgentTemplates['standalone-child'] = standaloneChild

    // Run parent agent first
    const parentResult = await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-parent',
      prompt: 'Parent task',
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = (parentMessages[0].content[0] as TextPart).text

    // Run child agent with inheritParentSystemPrompt=false
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'standalone-child' as const,
      messageHistory: [],
    }

    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-child',
      prompt: 'Child task',
      agentType: 'standalone-child',
      agentState: childAgentState,
      parentSystemPrompt: parentSystemPrompt,
    })

    const childMessages = capturedMessages

    // Verify child uses its own system prompt (not parent's)
    expect(childMessages[0].role).toBe('system')
    const text = (childMessages[0].content[0] as TextPart).text
    expect(text).not.toBe(parentSystemPrompt)
    expect(text).toContain('Standalone child system prompt')
  })

  it('should work independently: includeMessageHistory without inheritParentSystemPrompt', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Create a child that includes message history but uses its own system prompt
    const messageHistoryChild: AgentTemplate = {
      id: 'message-history-child',
      displayName: 'Message History Child',
      outputMode: 'last_message',
      inputSchema: {},
      spawnerPrompt: '',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: true, // Includes message history
      inheritParentSystemPrompt: false, // But uses own system prompt
      mcpServers: {},
      toolNames: [],
      spawnableAgents: [],
      systemPrompt: 'Child with message history system prompt',
      instructionsPrompt: '',
      stepPrompt: '',
    }

    mockLocalAgentTemplates['message-history-child'] = messageHistoryChild

    // Run parent agent first
    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-parent',
      prompt: 'Parent task',
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = (parentMessages[0].content[0] as TextPart).text

    // Run child agent
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'message-history-child' as const,
      messageHistory: [
        userMessage('Previous message'),
        assistantMessage('Previous response'),
      ],
    }

    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-child',
      prompt: 'Child task',
      agentType: 'message-history-child',
      agentState: childAgentState,
      parentSystemPrompt: parentSystemPrompt,
    })

    const childMessages = capturedMessages

    // Verify child uses its own system prompt (not parent's)
    expect(childMessages[0].role).toBe('system')
    const text = (childMessages[0].content[0] as TextPart).text
    expect(text).not.toBe(parentSystemPrompt)
    expect(text).toContain('Child with message history system prompt')

    // Verify message history was included
    expect(childMessages.length).toBeGreaterThan(2)
    const hasMessageHistory = childMessages.some(
      (msg) =>
        msg.role === 'user' &&
        msg.content[0].type === 'text' &&
        msg.content[0].text === 'Previous message',
    )
    expect(hasMessageHistory).toBe(true)
  })

  it('should validate that agents with inheritParentSystemPrompt cannot have custom systemPrompt', () => {
    const {
      DynamicAgentTemplateSchema,
    } = require('@codebuff/common/types/dynamic-agent-template')

    // Valid: inheritParentSystemPrompt with empty systemPrompt
    const validAgent = {
      id: 'valid-agent',
      displayName: 'Valid',
      model: 'anthropic/claude-sonnet-4',
      inheritParentSystemPrompt: true,
      systemPrompt: '',
      instructionsPrompt: '',
      stepPrompt: '',
    }
    const validResult = DynamicAgentTemplateSchema.safeParse(validAgent)
    expect(validResult.success).toBe(true)

    // Invalid: inheritParentSystemPrompt with custom systemPrompt
    const invalidAgent = {
      id: 'invalid-agent',
      displayName: 'Invalid',
      model: 'anthropic/claude-sonnet-4',
      inheritParentSystemPrompt: true,
      systemPrompt: 'Custom system prompt',
      instructionsPrompt: '',
      stepPrompt: '',
    }
    const invalidResult = DynamicAgentTemplateSchema.safeParse(invalidAgent)
    expect(invalidResult.success).toBe(false)
    if (!invalidResult.success) {
      expect(invalidResult.error.message).toContain(
        'Cannot specify both systemPrompt and inheritParentSystemPrompt',
      )
    }
  })

  it('should enable prompt caching with matching system prompt prefix', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Run parent agent
    const parentResult = await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-parent',
      prompt: 'Parent task',
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = (parentMessages[0].content[0] as TextPart).text

    // Run child agent with inheritParentSystemPrompt=true
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'child' as const,
      messageHistory: [],
    }

    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-child',
      prompt: 'Child task',
      agentType: 'child',
      agentState: childAgentState,
      parentSystemPrompt: parentSystemPrompt,
    })

    const childMessages = capturedMessages

    // Verify both agents use the same system prompt
    expect(parentMessages[0].role).toBe('system')
    expect(childMessages[0].role).toBe('system')
    expect(childMessages[0].content).toEqual(parentMessages[0].content)

    // This matching system prompt enables prompt caching:
    // Both agents will have the same system message at the start,
    // allowing the LLM provider to cache and reuse the system prompt
  })

  it('should pass parent tools and add subagent tools message when inheritParentSystemPrompt is true', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Create a child that inherits system prompt and has specific tools
    const childWithTools: AgentTemplate = {
      id: 'child-with-tools',
      displayName: 'Child With Tools',
      outputMode: 'last_message',
      inputSchema: {},
      spawnerPrompt: '',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: false,
      inheritParentSystemPrompt: true,
      mcpServers: {},
      toolNames: ['read_files', 'code_search'],
      spawnableAgents: [],
      systemPrompt: '',
      instructionsPrompt: '',
      stepPrompt: '',
    }

    mockLocalAgentTemplates['child-with-tools'] = childWithTools

    // Run parent agent first
    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-parent',
      prompt: 'Parent task',
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = (parentMessages[0].content[0] as TextPart).text

    // Mock parent tools
    const parentTools = { read_files: {}, write_file: {}, code_search: {} }

    // Run child agent with inheritParentSystemPrompt=true and parentTools
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'child-with-tools' as const,
      messageHistory: [],
    }

    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-child',
      prompt: 'Child task',
      agentType: 'child-with-tools',
      agentState: childAgentState,
      parentSystemPrompt: parentSystemPrompt,
      parentTools: parentTools as any,
    })

    const childMessages = capturedMessages

    // Verify child uses parent's system prompt
    expect(childMessages[0].role).toBe('system')
    expect((childMessages[0].content[0] as TextPart).text).toBe(
      parentSystemPrompt,
    )

    // Verify there's an instructions prompt message that includes subagent tools info
    const instructionsMessage = childMessages.find(
      (msg) =>
        msg.role === 'user' &&
        msg.content[0].type === 'text' &&
        msg.content[0].text.includes('subagent') &&
        msg.content[0].text.includes('read_files') &&
        msg.content[0].text.includes('code_search'),
    )
    expect(instructionsMessage).toBeTruthy()
  })

  it('should support both inheritParentSystemPrompt and includeMessageHistory together', async () => {
    const sessionState = getInitialSessionState(mockFileContext)

    // Create a child that inherits system prompt AND includes message history
    const fullInheritChild: AgentTemplate = {
      id: 'full-inherit-child',
      displayName: 'Full Inherit Child',
      outputMode: 'last_message',
      inputSchema: {},
      spawnerPrompt: '',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: true, // Includes message history
      inheritParentSystemPrompt: true, // AND inherits system prompt
      mcpServers: {},
      toolNames: [],
      spawnableAgents: [],
      systemPrompt: '', // Must be empty
      instructionsPrompt: '',
      stepPrompt: '',
    }

    mockLocalAgentTemplates['full-inherit-child'] = fullInheritChild

    // Run parent agent first with some message history
    const parentResult = await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-parent',
      prompt: 'Parent task',
      agentType: 'parent',
      agentState: {
        ...sessionState.mainAgentState,
        messageHistory: [
          userMessage('Initial question'),
          assistantMessage('Initial answer'),
        ],
      },
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = (parentMessages[0].content[0] as TextPart).text

    // Run child agent
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'full-inherit-child' as const,
      messageHistory: [
        userMessage('Initial question'),
        assistantMessage('Initial answer'),
      ],
    }

    await loopAgentSteps({
      ...loopAgentStepsBaseParams,
      userInputId: 'test-child',
      prompt: 'Child task',
      agentType: 'full-inherit-child',
      agentState: childAgentState,
      parentSystemPrompt: parentSystemPrompt,
    })

    const childMessages = capturedMessages

    // Verify child inherits parent's system prompt
    expect(childMessages[0].role).toBe('system')
    expect((childMessages[0].content[0] as TextPart).text).toBe(
      parentSystemPrompt,
    )

    // Verify message history was included
    expect(childMessages.length).toBeGreaterThan(2)
    const hasMessageHistory = childMessages.some(
      (msg) =>
        msg.role === 'user' &&
        msg.content[0].type === 'text' &&
        msg.content[0].text === 'Initial question',
    )
    expect(hasMessageHistory).toBe(true)
  })
})
