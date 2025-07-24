import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { WebSocket } from 'ws'

// Mock imports
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { runAgentStep } from '../run-agent-step'
import { getAllAgentTemplates } from '../templates/agent-registry'
import * as websocketAction from '../websockets/websocket-action'

describe('runAgentStep - update_report tool', () => {
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

    // Mock agent templates to include update_report in base
    mockModule('@codebuff/backend/templates/agent-list', () => {
      const { agentTemplates } = require('../templates/agent-list')
      return {
        agentTemplates: {
          ...agentTemplates,
          base: {
            ...agentTemplates.base,
            toolNames: [
              ...agentTemplates.base.toolNames,
              'update_report', // Add this tool
            ],
          },
        },
      }
    })
  })

  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true)
    )

    spyOn(websocketAction, 'requestFiles').mockImplementation(
      async (ws: any, paths: string[]) => {
        const results: Record<string, string | null> = {}
        paths.forEach((p) => {
          if (p === 'src/auth.ts') {
            results[p] = 'export function authenticate() { return true; }'
          } else if (p === 'src/user.ts') {
            results[p] = 'export interface User { id: string; name: string; }'
          } else {
            results[p] = null
          }
        })
        return results
      }
    )

    spyOn(websocketAction, 'requestFile').mockImplementation(
      async (ws: any, path: string) => {
        if (path === 'src/auth.ts') {
          return 'export function authenticate() { return true; }'
        } else if (path === 'src/user.ts') {
          return 'export interface User { id: string; name: string; }'
        }
        return null
      }
    )

    spyOn(websocketAction, 'requestToolCall').mockImplementation(async () => ({
      success: true,
      result: 'Tool call success' as any,
    }))

    // Mock LLM APIs
    spyOn(aisdk, 'promptAiSdk').mockImplementation(() =>
      Promise.resolve('Test response')
    )
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
  })

  class MockWebSocket {
    send(msg: string) {}
    close() {}
    on(event: string, listener: (...args: any[]) => void) {}
    removeListener(event: string, listener: (...args: any[]) => void) {}
  }

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
    systemInfo: {
      platform: 'test',
      shell: 'test',
      nodeVersion: 'test',
      arch: 'test',
      homedir: '/home/test',
      cpus: 1,
    },
    fileVersions: [],
    agentTemplates: {},
  }

  it('should set output with simple key-value pair', async () => {
    const mockResponse =
      getToolCallString(
        'set_output',
        {
          message: 'Hi',
        },
        false
      ) +
      '\n\n' +
      getToolCallString('end_turn', {}, true)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Analyze the codebase',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(result.agentState.output).toEqual({
      message: 'Hi',
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should set output with complex data', async () => {
    const mockResponse =
      getToolCallString(
        'set_output',
        {
          message: 'Analysis complete',
          status: 'success',
          findings: ['Bug in auth.ts', 'Missing validation'],
        },
        false
      ) + getToolCallString('end_turn', {}, true)
    console.log('mockResponse', mockResponse)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Analyze the codebase',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(result.agentState.output).toEqual({
      message: 'Analysis complete',
      status: 'success',
      findings: ['Bug in auth.ts', 'Missing validation'],
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should replace existing output data', async () => {
    const mockResponse =
      getToolCallString(
        'set_output',
        {
          newField: 'new value',
          existingField: 'updated value',
        },
        false
      ) + getToolCallString('end_turn', {}, true)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    // Pre-populate the output with existing data
    agentState.output = {
      existingField: 'original value',
      anotherField: 'unchanged',
    }
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Update the output',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(result.agentState.output).toEqual({
      newField: 'new value',
      existingField: 'updated value',
    })
  })

  it('should handle empty output parameter', async () => {
    const mockResponse =
      getToolCallString('set_output', {}, false) +
      getToolCallString('end_turn', {}, true)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    agentState.output = { existingField: 'value' }
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Update with empty object',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    // Should replace with empty object
    expect(result.agentState.output).toEqual({})
  })
})
