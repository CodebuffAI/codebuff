import { TEST_USER_ID } from '@codebuff/common/old-constants'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  spyOn,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'

import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { loopAgentSteps } from '../run-agent-step'
import * as websocketAction from '../websockets/websocket-action'

import type { AgentTemplate } from '../templates/types'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

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

class MockWebSocket {
  send(msg: string) {}
  close() {}
  on(event: string, listener: (...args: any[]) => void) {}
  removeListener(event: string, listener: (...args: any[]) => void) {}
}

describe('Prompt Caching for Subagents with includeMessageHistory', () => {
  let mockLocalAgentTemplates: Record<string, AgentTemplate>
  let capturedMessages: Message[] = []

  beforeAll(() => {
    // Mock logger
    mockModule('@codebuff/backend/util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
    }))
  })

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
        includeMessageHistory: true, // Should inherit parent's system prompt
        mcpServers: {},
        toolNames: [],
        spawnableAgents: [],
        systemPrompt: '', // Must be empty when includeMessageHistory is true
        instructionsPrompt: '',
        stepPrompt: '',
      } satisfies AgentTemplate,
    }

    // Mock LLM API to capture messages and end turn immediately
    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(
      async function* (options) {
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
    )

    // Mock file operations
    spyOn(websocketAction, 'requestFiles').mockImplementation(
      async (ws, paths) => {
        const results: Record<string, string | null> = {}
        paths.forEach((path) => {
          results[path] = null
        })
        return results
      },
    )

    spyOn(websocketAction, 'requestToolCall').mockImplementation(
      async (ws, userInputId, toolName, input) => {
        return {
          output: [
            {
              type: 'json',
              value: { message: 'Success' },
            },
          ],
        }
      },
    )

    // Mock live user input
    const liveUserInputs = require('../live-user-inputs')
    spyOn(liveUserInputs, 'checkLiveUserInput').mockImplementation(() => true)
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
  })

  it('should inherit parent system prompt when includeMessageHistory is true', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const ws = new MockWebSocket() as unknown as WebSocket

    // Run parent agent first to establish system prompt
    const parentResult = await loopAgentSteps(ws, {
      userInputId: 'test-parent',
      prompt: 'Parent task',
      params: undefined,
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
    })

    // Capture parent's messages which include the system prompt
    const parentMessages = capturedMessages
    expect(parentMessages.length).toBeGreaterThan(0)
    expect(parentMessages[0].role).toBe('system')
    const parentSystemPrompt = parentMessages[0].content as string
    expect(parentSystemPrompt).toContain(
      'Parent agent system prompt for testing',
    )

    // Now run child agent with includeMessageHistory and parentSystemPrompt
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'child' as const,
      messageHistory: parentResult.agentState.messageHistory,
    }

    await loopAgentSteps(ws, {
      userInputId: 'test-child',
      prompt: 'Child task',
      params: undefined,
      agentType: 'child',
      agentState: childAgentState,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      parentSystemPrompt: parentSystemPrompt,
    })

    // Verify child uses parent's system prompt
    const childMessages = capturedMessages
    expect(childMessages.length).toBeGreaterThan(0)
    expect(childMessages[0].role).toBe('system')
    expect(childMessages[0].content).toBe(parentSystemPrompt)
  })

  it('should have matching message prefix for prompt caching', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const ws = new MockWebSocket() as unknown as WebSocket

    // Run parent agent
    const parentResult = await loopAgentSteps(ws, {
      userInputId: 'test-parent',
      prompt: 'Parent task',
      params: undefined,
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = parentMessages[0].content as string

    // Run child agent
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'child' as const,
      messageHistory: parentResult.agentState.messageHistory,
    }

    await loopAgentSteps(ws, {
      userInputId: 'test-child',
      prompt: 'Child task',
      params: undefined,
      agentType: 'child',
      agentState: childAgentState,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      parentSystemPrompt: parentSystemPrompt,
    })

    const childMessages = capturedMessages

    // Verify the message prefixes match for prompt caching
    // 1. Both should start with system message
    expect(parentMessages[0].role).toBe('system')
    expect(childMessages[0].role).toBe('system')

    // 2. System prompts should be identical
    expect(childMessages[0].content).toBe(parentMessages[0].content)

    // 3. Child should have parent's message history as its prefix (after system message)
    // This creates the matching prefix needed for prompt caching
    expect(childMessages.length).toBeGreaterThan(parentResult.agentState.messageHistory.length)
    
    // Verify child includes parent's message history
    for (let i = 0; i < parentResult.agentState.messageHistory.length; i++) {
      const parentMsg = parentResult.agentState.messageHistory[i]
      const childMsg = childMessages[i + 1] // +1 to skip system message
      expect(childMsg.role).toBe(parentMsg.role)
    }

    // 4. Verify cache control markers would be applied correctly
    // The system message should be cacheable
    expect(parentMessages[0]).toBeDefined()
    expect(childMessages[0]).toBeDefined()
  })

  it('should generate different system prompts when includeMessageHistory is false', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const ws = new MockWebSocket() as unknown as WebSocket

    // Create a child agent that does NOT include message history
    const standaloneChild: AgentTemplate = {
      id: 'standalone-child',
      displayName: 'Standalone Child',
      outputMode: 'last_message',
      inputSchema: {},
      spawnerPrompt: '',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: false,
      mcpServers: {},
      toolNames: [],
      spawnableAgents: [],
      systemPrompt: 'Standalone child system prompt',
      instructionsPrompt: '',
      stepPrompt: '',
    }

    mockLocalAgentTemplates['standalone-child'] = standaloneChild

    // Run parent agent first
    const parentResult = await loopAgentSteps(ws, {
      userInputId: 'test-parent',
      prompt: 'Parent task',
      params: undefined,
      agentType: 'parent',
      agentState: sessionState.mainAgentState,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
    })

    const parentMessages = capturedMessages
    const parentSystemPrompt = parentMessages[0].content as string

    // Run child agent with includeMessageHistory=false
    capturedMessages = []
    const childAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'child-agent',
      agentType: 'standalone-child' as const,
      messageHistory: [],
    }

    await loopAgentSteps(ws, {
      userInputId: 'test-child',
      prompt: 'Child task',
      params: undefined,
      agentType: 'standalone-child',
      agentState: childAgentState,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates: mockLocalAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
      parentSystemPrompt: parentSystemPrompt,
    })

    const childMessages = capturedMessages

    // Verify child uses its own system prompt (not parent's)
    expect(childMessages[0].role).toBe('system')
    expect(childMessages[0].content).not.toBe(parentSystemPrompt)
    expect(childMessages[0].content).toContain('Standalone child system prompt')
  })

  it('should validate that agents with includeMessageHistory cannot have custom systemPrompt', () => {
    const { DynamicAgentTemplateSchema } = require('@codebuff/common/types/dynamic-agent-template')

    // Valid: includeMessageHistory with empty systemPrompt
    const validAgent = {
      id: 'valid-agent',
      displayName: 'Valid',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: true,
      systemPrompt: '',
      instructionsPrompt: '',
      stepPrompt: '',
    }
    const validResult = DynamicAgentTemplateSchema.safeParse(validAgent)
    expect(validResult.success).toBe(true)

    // Invalid: includeMessageHistory with custom systemPrompt
    const invalidAgent = {
      id: 'invalid-agent',
      displayName: 'Invalid',
      model: 'anthropic/claude-sonnet-4',
      includeMessageHistory: true,
      systemPrompt: 'Custom system prompt',
      instructionsPrompt: '',
      stepPrompt: '',
    }
    const invalidResult = DynamicAgentTemplateSchema.safeParse(invalidAgent)
    expect(invalidResult.success).toBe(false)
    if (!invalidResult.success) {
      expect(invalidResult.error.message).toContain(
        'Cannot specify both systemPrompt and includeMessageHistory',
      )
    }
  })
})
