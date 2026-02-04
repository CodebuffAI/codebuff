import {
  ABORT_ERROR_MESSAGE,
  isAbortError,
  promptAborted,
  promptSuccess,
  unwrapPromptResult,
  type PromptResult,
} from '@codebuff/common/util/error'
import { describe, expect, it } from 'bun:test'

describe('PromptResult type and helpers', () => {
  describe('promptSuccess', () => {
    it('should create a success result with the value', () => {
      const result = promptSuccess('test value')
      expect(result.aborted).toBe(false)
      expect(result.value).toBe('test value')
    })

    it('should work with complex types', () => {
      const complexValue = { key: 'value', nested: { array: [1, 2, 3] } }
      const result = promptSuccess(complexValue)
      expect(result.aborted).toBe(false)
      expect(result.value).toEqual(complexValue)
    })

    it('should work with null values', () => {
      const result = promptSuccess(null)
      expect(result.aborted).toBe(false)
      expect(result.value).toBeNull()
    })
  })

  describe('promptAborted', () => {
    it('should create an aborted result without reason', () => {
      const result = promptAborted()
      expect(result.aborted).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should create an aborted result with reason', () => {
      const result = promptAborted('User cancelled input')
      expect(result.aborted).toBe(true)
      expect(result.reason).toBe('User cancelled input')
    })
  })

  describe('type discrimination', () => {
    it('should discriminate between success and aborted using aborted flag', () => {
      const successResult: PromptResult<string> = promptSuccess('test')
      const abortedResult: PromptResult<string> = promptAborted('cancelled')

      // Type narrowing should work
      if (successResult.aborted) {
        // This should never happen
        expect(true).toBe(false)
      } else {
        // TypeScript should know this is PromptSuccess<string>
        expect(successResult.value).toBe('test')
      }

      if (abortedResult.aborted) {
        // TypeScript should know this is PromptAborted
        expect(abortedResult.reason).toBe('cancelled')
      } else {
        // This should never happen
        expect(true).toBe(false)
      }
    })

    it('should allow checking aborted status before accessing value', () => {
      function processResult(result: PromptResult<string>): string {
        if (result.aborted) {
          return `Aborted: ${result.reason ?? 'unknown reason'}`
        }
        return `Success: ${result.value}`
      }

      expect(processResult(promptSuccess('hello'))).toBe('Success: hello')
      expect(processResult(promptAborted('user cancelled'))).toBe(
        'Aborted: user cancelled',
      )
      expect(processResult(promptAborted())).toBe('Aborted: unknown reason')
    })
  })

  describe('usage patterns', () => {
    it('should support early return on abort', async () => {
      async function mockPromptAiSdk(): Promise<PromptResult<string>> {
        // Simulate abort
        return promptAborted('Request cancelled')
      }

      const result = await mockPromptAiSdk()
      if (result.aborted) {
        // Early return pattern - caller can handle abort gracefully
        expect(result.reason).toBe('Request cancelled')
        return
      }
      
      // This code should not be reached
      expect(true).toBe(false)
    })

    it('should support throwing on abort', async () => {
      async function mockPromptAiSdk(): Promise<PromptResult<string>> {
        return promptAborted('Request cancelled')
      }

      async function callerThatThrows() {
        const result = await mockPromptAiSdk()
        if (result.aborted) {
          throw new Error(`Prompt aborted: ${result.reason}`)
        }
        return result.value
      }

      await expect(callerThatThrows()).rejects.toThrow('Prompt aborted: Request cancelled')
    })

    it('should support unwrap helper pattern', () => {
      // Use the imported unwrapPromptResult helper which throws ABORT_ERROR_MESSAGE
      expect(unwrapPromptResult(promptSuccess('test'))).toBe('test')
      expect(() => unwrapPromptResult(promptAborted('cancelled'))).toThrow(
        ABORT_ERROR_MESSAGE,
      )
    })
  })

  describe('isAbortError', () => {
    it('should detect error with ABORT_ERROR_MESSAGE', () => {
      const error = new Error(ABORT_ERROR_MESSAGE)
      expect(isAbortError(error)).toBe(true)
    })

    it('should detect native AbortError by name', () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      expect(isAbortError(error)).toBe(true)
    })

    it('should detect DOMException AbortError', () => {
      // Simulate a DOMException-like error (as thrown by fetch when aborted)
      const error = new DOMException('signal is aborted without reason', 'AbortError')
      expect(isAbortError(error)).toBe(true)
    })

    it('should return false for regular errors', () => {
      const error = new Error('Some other error')
      expect(isAbortError(error)).toBe(false)
    })

    it('should return false for non-Error objects', () => {
      expect(isAbortError('string error')).toBe(false)
      expect(isAbortError({ message: ABORT_ERROR_MESSAGE })).toBe(false)
      expect(isAbortError(null)).toBe(false)
      expect(isAbortError(undefined)).toBe(false)
      expect(isAbortError(123)).toBe(false)
    })

    it('should return false for errors with similar but different messages', () => {
      expect(isAbortError(new Error('Request aborted by user'))).toBe(false)
      expect(isAbortError(new Error('request aborted'))).toBe(false) // case sensitive
      expect(isAbortError(new Error('Aborted'))).toBe(false)
    })
  })

  describe('unwrapPromptResult', () => {
    it('should return value for successful result', () => {
      const result = promptSuccess('test value')
      expect(unwrapPromptResult(result)).toBe('test value')
    })

    it('should return complex values', () => {
      const complexValue = { data: [1, 2, 3], nested: { key: 'value' } }
      const result = promptSuccess(complexValue)
      expect(unwrapPromptResult(result)).toEqual(complexValue)
    })

    it('should throw with ABORT_ERROR_MESSAGE for aborted result', () => {
      const result = promptAborted('User cancelled')
      expect(() => unwrapPromptResult(result)).toThrow(ABORT_ERROR_MESSAGE)
    })

    it('should throw with ABORT_ERROR_MESSAGE even when reason is provided', () => {
      // The reason is ignored - we always throw ABORT_ERROR_MESSAGE for consistency
      const result = promptAborted('Custom reason')
      expect(() => unwrapPromptResult(result)).toThrow(ABORT_ERROR_MESSAGE)
    })

    it('should throw with ABORT_ERROR_MESSAGE for aborted result without reason', () => {
      const result = promptAborted()
      expect(() => unwrapPromptResult(result)).toThrow(ABORT_ERROR_MESSAGE)
    })

    it('should throw an error that isAbortError detects', () => {
      const result = promptAborted()
      try {
        unwrapPromptResult(result)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(isAbortError(error)).toBe(true)
      }
    })
  })
})
