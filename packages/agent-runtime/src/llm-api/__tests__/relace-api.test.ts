import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  ABORT_ERROR_MESSAGE,
  promptAborted,
  promptSuccess,
} from '@codebuff/common/util/error'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { promptRelaceAI } from '../relace-api'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'

describe('promptRelaceAI', () => {
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  const baseParams = {
    runId: 'test-run-id',
    clientSessionId: 'test-client-session',
    fingerprintId: 'test-fingerprint',
    userInputId: 'test-user-input',
    userId: 'test-user-id',
  }

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
  })

  afterEach(() => {
    mock.restore()
  })

  describe('abort handling', () => {
    it('should throw immediately when primary Relace call returns aborted', async () => {
      agentRuntimeImpl.promptAiSdk = mock(() =>
        Promise.resolve(promptAborted('User cancelled')),
      )

      await expect(
        promptRelaceAI({
          ...agentRuntimeImpl,
          ...baseParams,
          initialCode: 'const x = 1;',
          editSnippet: 'const x = 2;',
          instructions: undefined,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(ABORT_ERROR_MESSAGE)

      // Should only be called once (no fallback to o3-mini)
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(1)
    })

    it('should throw immediately when primary Relace call returns aborted without reason', async () => {
      agentRuntimeImpl.promptAiSdk = mock(() =>
        Promise.resolve(promptAborted()),
      )

      await expect(
        promptRelaceAI({
          ...agentRuntimeImpl,
          ...baseParams,
          initialCode: 'function foo() { return 1; }',
          editSnippet: 'function foo() { return 42; }',
          instructions: 'Update return value',
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(ABORT_ERROR_MESSAGE)

      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(1)
    })

    it('should throw immediately when fallback o3-mini call returns aborted', async () => {
      let callCount = 0
      agentRuntimeImpl.promptAiSdk = mock(() => {
        callCount++
        if (callCount === 1) {
          // First call (Relace) fails with a non-abort error
          return Promise.reject(new Error('Relace API error'))
        }
        // Second call (o3-mini fallback) returns aborted
        return Promise.resolve(promptAborted('User cancelled during fallback'))
      })

      await expect(
        promptRelaceAI({
          ...agentRuntimeImpl,
          ...baseParams,
          initialCode: 'const x = 1;',
          editSnippet: 'const x = 2;',
          instructions: undefined,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(ABORT_ERROR_MESSAGE)

      // Should be called twice: primary + fallback
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(2)
    })

    it('should not fall back when primary Relace is aborted', async () => {
      agentRuntimeImpl.promptAiSdk = mock(() =>
        Promise.resolve(promptAborted()),
      )

      await expect(
        promptRelaceAI({
          ...agentRuntimeImpl,
          ...baseParams,
          initialCode: 'const x = 1;\nconst y = 2;',
          editSnippet: 'const x = 100;\nconst y = 200;',
          instructions: 'Update values',
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(ABORT_ERROR_MESSAGE)

      // Should only be called once - no fallback to o3-mini
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(1)
    })

    it('should not fall back when native AbortError is thrown', async () => {
      // Simulate native AbortError thrown by fetch/AI SDK when AbortSignal is triggered
      const nativeAbortError = new DOMException('signal is aborted without reason', 'AbortError')
      agentRuntimeImpl.promptAiSdk = mock(() =>
        Promise.reject(nativeAbortError),
      )

      await expect(
        promptRelaceAI({
          ...agentRuntimeImpl,
          ...baseParams,
          initialCode: 'const x = 1;',
          editSnippet: 'const x = 2;',
          instructions: undefined,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow()

      // Should only be called once - native AbortError should not trigger fallback
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(1)
    })

    it('should not fall back when Error with name AbortError is thrown', async () => {
      // Some libraries throw Error with name set to AbortError
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      agentRuntimeImpl.promptAiSdk = mock(() =>
        Promise.reject(abortError),
      )

      await expect(
        promptRelaceAI({
          ...agentRuntimeImpl,
          ...baseParams,
          initialCode: 'const x = 1;',
          editSnippet: 'const x = 2;',
          instructions: undefined,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow()

      // Should only be called once - AbortError by name should not trigger fallback
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(1)
    })

    it('should fall back from Relace to o3-mini on non-abort error', async () => {
      let callCount = 0
      agentRuntimeImpl.promptAiSdk = mock(() => {
        callCount++
        if (callCount === 1) {
          // First call (Relace) fails with non-abort error
          return Promise.reject(new Error('Relace service unavailable'))
        }
        // Second call (o3-mini) succeeds
        return Promise.resolve(promptSuccess('```\nconst x = 2;\n```'))
      })

      const result = await promptRelaceAI({
        ...agentRuntimeImpl,
        ...baseParams,
        initialCode: 'const x = 1;',
        editSnippet: 'const x = 2;',
        instructions: undefined,
        signal: new AbortController().signal,
      })

      // parseMarkdownCodeBlock handles the code block, result ends with newline
      expect(result).toContain('const x = 2;')
      expect(result.endsWith('\n')).toBe(true)
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(2)
    })
  })

  describe('successful responses', () => {
    it('should return response from primary Relace call when successful', async () => {
      agentRuntimeImpl.promptAiSdk = mock(() =>
        Promise.resolve(promptSuccess('const x = 2;')),
      )

      const result = await promptRelaceAI({
        ...agentRuntimeImpl,
        ...baseParams,
        initialCode: 'const x = 1;',
        editSnippet: 'const x = 2;',
        instructions: undefined,
        signal: new AbortController().signal,
      })

      expect(result).toBe('const x = 2;\n')
      expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledTimes(1)
    })

    it('should include instructions in the request when provided', async () => {
      let capturedContent: string = ''
      agentRuntimeImpl.promptAiSdk = mock((params: any) => {
        // The message content could be a string or an array of content parts
        const content = params.messages[0].content
        capturedContent = typeof content === 'string' 
          ? content 
          : JSON.stringify(content)
        return Promise.resolve(promptSuccess('updated code'))
      })

      await promptRelaceAI({
        ...agentRuntimeImpl,
        ...baseParams,
        initialCode: 'const x = 1;',
        editSnippet: 'const x = 2;',
        instructions: 'Update the value of x',
        signal: new AbortController().signal,
      })

      expect(capturedContent).toContain('<instruction>')
      expect(capturedContent).toContain('Update the value of x')
    })

    it('should not include instruction tags when instructions are undefined', async () => {
      let capturedContent: string = ''
      agentRuntimeImpl.promptAiSdk = mock((params: any) => {
        const content = params.messages[0].content
        capturedContent = typeof content === 'string' 
          ? content 
          : JSON.stringify(content)
        return Promise.resolve(promptSuccess('updated code'))
      })

      await promptRelaceAI({
        ...agentRuntimeImpl,
        ...baseParams,
        initialCode: 'const x = 1;',
        editSnippet: 'const x = 2;',
        instructions: undefined,
        signal: new AbortController().signal,
      })

      expect(capturedContent).not.toContain('<instruction>')
    })
  })
})
