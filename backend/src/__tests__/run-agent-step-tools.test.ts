import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { WebSocket } from 'ws'

// Mock imports
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { runAgentStep } from '../run-agent-step'
import * as tools from '../tools'
import * as websocketAction from '../websockets/websocket-action'

// Mock logger
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

// Mock agent templates to include update_report in base
mock.module('../templates/agent-list', () => {
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

describe('runAgentStep - update_report tool', () => {
  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true)
    )

    // Mock the readFiles function from tools.ts
    spyOn(tools, 'readFiles').mockImplementation(
      async (paths: string[], projectRoot: string) => {
        const results: Record<string, string | null> = {}
        paths.forEach((p) => {
          if (p === 'src/auth.ts') {
            results[p] = 'export function authenticate() { return true; }'
          } else if (p === 'src/user.ts') {
            results[p] = 'export interface User { id: string; name: string; }'
          } else if (p === 'src/components/auth/login.tsx') {
            results[p] = 'export function Login() { return <div>Login</div>; }'
          } else if (p === 'src/utils/validation.ts') {
            results[p] = 'export function validate() { return true; }'
          } else {
            results[p] = null
          }
        })
        return results
      }
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

  it('should update report with simple key-value pair', async () => {
    const mockResponse =
      getToolCallString('update_report', {
        json_update: {
          message: 'Hi',
        },
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

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
        agentState,
        prompt: 'Analyze the codebase',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(result.agentState.report).toEqual({
      message: 'Hi',
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should update report with json_update', async () => {
    const mockResponse =
      getToolCallString('update_report', {
        json_update: {
          message: 'Analysis complete',
          status: 'success',
          findings: ['Bug in auth.ts', 'Missing validation'],
        },
      }) + getToolCallString('end_turn', {})
    console.log('mockResponse', mockResponse)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

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
        agentState,
        prompt: 'Analyze the codebase',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(result.agentState.report).toEqual({
      message: 'Analysis complete',
      status: 'success',
      findings: ['Bug in auth.ts', 'Missing validation'],
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should merge with existing report data', async () => {
    const mockResponse =
      getToolCallString('update_report', {
        json_update: {
          newField: 'new value',
          existingField: 'updated value',
        },
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    // Pre-populate the report with existing data
    agentState.report = {
      existingField: 'original value',
      anotherField: 'unchanged',
    }

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
        agentState,
        prompt: 'Update the report',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(result.agentState.report).toEqual({
      existingField: 'updated value', // Should be updated
      anotherField: 'unchanged', // Should remain unchanged
      newField: 'new value', // Should be added
    })
  })

  it('should handle empty json_update parameter', async () => {
    const mockResponse =
      getToolCallString('update_report', {
        json_update: {},
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    agentState.report = { existingField: 'value' }

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
        agentState,
        prompt: 'Update with empty object',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    // Should preserve existing report data
    expect(result.agentState.report).toEqual({
      existingField: 'value',
    })
  })
})
