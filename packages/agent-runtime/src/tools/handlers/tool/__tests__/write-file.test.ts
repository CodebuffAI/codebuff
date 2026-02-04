import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { AbortError, isAbortError, promptAborted } from '@codebuff/common/util/error'
import { getInitialAgentState } from '@codebuff/common/types/session-state'
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import {
  getFileProcessingValues,
  handleWriteFile,
  type FileProcessingState,
} from '../write-file'
import * as tokenCounter from '../../../../util/token-counter'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

describe('handleWriteFile', () => {
  let mockFileProcessingState: FileProcessingState
  let mockAgentState: AgentState

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }

    mockFileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      fileChangeErrors: [],
      fileChanges: [],
      firstFileProcessed: false,
    }

    mockAgentState = getInitialAgentState()
  })

  describe('abort handling', () => {
    it('should throw AbortError when processFileBlock returns aborted (large file path)', async () => {
      // Mock countTokens to exceed LARGE_FILE_TOKEN_LIMIT (64000) to trigger large file path
      const countTokensSpy = spyOn(tokenCounter, 'countTokens').mockReturnValue(100000)

      // Mock promptAiSdk to return aborted (this will cause handleLargeFile to abort)
      agentRuntimeImpl.promptAiSdk = async () => promptAborted('User cancelled')

      const toolCall = {
        toolCallId: 'test-tool-call-id',
        toolName: 'write_file' as const,
        input: {
          path: 'test.ts',
          instructions: 'Update the file',
          // Using lazy edit markers to trigger LLM call in handleLargeFile
          content: '// ... existing code ...\nconst x = 1;\n// ... existing code ...',
        },
      }

      const params = {
        ...agentRuntimeImpl,
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        agentState: mockAgentState,
        clientSessionId: 'test-client-session',
        fileProcessingState: mockFileProcessingState,
        fingerprintId: 'test-fingerprint',
        prompt: 'test prompt',
        userId: TEST_USER_ID,
        userInputId: 'test-user-input-id',
        runId: 'test-run-id',
        fullResponse: '',
        requestClientToolCall: mock(async () => [{ type: 'json', value: { file: 'test.ts', message: 'success', unifiedDiff: '' } }] as CodebuffToolOutput<'write_file'>),
        requestOptionalFile: mock(async () => 'existing content'),
        writeToClient: mock(() => {}),
        signal: new AbortController().signal,
      }

      // The handler should throw AbortError when processFileBlock returns aborted
      await expect(handleWriteFile(params)).rejects.toThrow(AbortError)
      countTokensSpy.mockRestore()
    })

    it('should propagate AbortError with the abort reason', async () => {
      // Mock countTokens to exceed LARGE_FILE_TOKEN_LIMIT
      const countTokensSpy = spyOn(tokenCounter, 'countTokens').mockReturnValue(100000)

      const abortReason = 'User pressed Ctrl+C during file edit'
      agentRuntimeImpl.promptAiSdk = async () => promptAborted(abortReason)

      const toolCall = {
        toolCallId: 'test-tool-call-id-2',
        toolName: 'write_file' as const,
        input: {
          path: 'another-test.ts',
          instructions: 'Make changes',
          content: '// ... existing code ...\nfunction hello() { return "world"; }\n// ... existing code ...',
        },
      }

      const params = {
        ...agentRuntimeImpl,
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        agentState: mockAgentState,
        clientSessionId: 'test-client-session',
        fileProcessingState: mockFileProcessingState,
        fingerprintId: 'test-fingerprint',
        prompt: 'test prompt',
        userId: TEST_USER_ID,
        userInputId: 'test-user-input-id',
        runId: 'test-run-id',
        fullResponse: '',
        requestClientToolCall: mock(async () => [{ type: 'json', value: { file: 'another-test.ts', message: 'success', unifiedDiff: '' } }] as CodebuffToolOutput<'write_file'>),
        requestOptionalFile: mock(async () => 'existing content with\nsome lines'),
        writeToClient: mock(() => {}),
        signal: new AbortController().signal,
      }

      try {
        await handleWriteFile(params)
        expect.unreachable('Should have thrown AbortError')
      } catch (error) {
        expect(isAbortError(error)).toBe(true)
        expect(error).toBeInstanceOf(AbortError)
        expect((error as Error).message).toContain(abortReason)
      }
      countTokensSpy.mockRestore()
    })

    it('should convert non-abort errors to tool errors (not throw)', async () => {
      // Mock countTokens to exceed LARGE_FILE_TOKEN_LIMIT
      const countTokensSpy = spyOn(tokenCounter, 'countTokens').mockReturnValue(100000)

      // Mock promptAiSdk to throw a non-abort error
      agentRuntimeImpl.promptAiSdk = async () => {
        throw new Error('Network connection failed')
      }

      const toolCall = {
        toolCallId: 'test-tool-call-id-3',
        toolName: 'write_file' as const,
        input: {
          path: 'error-test.ts',
          instructions: 'This will fail',
          // Using lazy edit markers to trigger LLM call in handleLargeFile
          content: '// ... existing code ...\nconst broken = true;\n// ... existing code ...',
        },
      }

      const params = {
        ...agentRuntimeImpl,
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        agentState: mockAgentState,
        clientSessionId: 'test-client-session',
        fileProcessingState: mockFileProcessingState,
        fingerprintId: 'test-fingerprint',
        prompt: 'test prompt',
        userId: TEST_USER_ID,
        userInputId: 'test-user-input-id',
        runId: 'test-run-id',
        fullResponse: '',
        requestClientToolCall: mock(async () => [{ type: 'json', value: { file: 'error-test.ts', message: 'success', unifiedDiff: '' } }] as CodebuffToolOutput<'write_file'>),
        requestOptionalFile: mock(async () => 'const original = 1;\nconst something = 2;'),
        writeToClient: mock(() => {}),
        signal: new AbortController().signal,
      }

      // Non-abort errors should NOT throw - they should be converted to tool error results
      const result = await handleWriteFile(params)
      expect(result.output).toBeDefined()
      // The error should be in the output as a tool error, not thrown
      expect(result.output[0].type).toBe('json')
      if (result.output[0].type === 'json') {
        expect(result.output[0].value).toHaveProperty('errorMessage')
      }
      countTokensSpy.mockRestore()
    })
  })

  describe('getFileProcessingValues', () => {
    it('should copy file processing state values', () => {
      const state: FileProcessingState = {
        promisesByPath: { 'test.ts': [] },
        allPromises: [],
        fileChangeErrors: [],
        fileChanges: [],
        firstFileProcessed: true,
      }

      const result = getFileProcessingValues(state)
      expect(result.firstFileProcessed).toBe(true)
      expect(result.promisesByPath).toEqual({ 'test.ts': [] })
    })
  })
})
