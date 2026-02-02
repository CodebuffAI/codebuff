import { describe, expect, it } from 'bun:test'

import {
  ABORT_ERROR_MESSAGE,
  AbortError,
  isAbortError,
  promptAborted,
  promptSuccess,
  unwrapPromptResult,
  type PromptResult,
} from '../error'

describe('AbortError class', () => {
  describe('constructor', () => {
    it('creates error without reason', () => {
      const error = new AbortError()
      expect(error.message).toBe(ABORT_ERROR_MESSAGE)
      expect(error.name).toBe('AbortError')
    })

    it('creates error with reason', () => {
      const error = new AbortError('User cancelled')
      expect(error.message).toBe(`${ABORT_ERROR_MESSAGE}: User cancelled`)
      expect(error.name).toBe('AbortError')
    })

    it('creates error with empty string reason', () => {
      const error = new AbortError('')
      // Empty string is falsy, so no reason appended
      expect(error.message).toBe(ABORT_ERROR_MESSAGE)
    })

    it('is instanceof Error', () => {
      const error = new AbortError()
      expect(error instanceof Error).toBe(true)
      expect(error instanceof AbortError).toBe(true)
    })

    it('has stack trace', () => {
      const error = new AbortError('test')
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AbortError')
    })
  })

  describe('message format', () => {
    it('reason is appended after colon and space', () => {
      const error = new AbortError('timeout')
      expect(error.message).toBe('Request aborted: timeout')
    })

    it('preserves special characters in reason', () => {
      const error = new AbortError('User pressed Ctrl+C')
      expect(error.message).toBe('Request aborted: User pressed Ctrl+C')
    })

    it('handles multi-line reason', () => {
      const error = new AbortError('First line\nSecond line')
      expect(error.message).toBe('Request aborted: First line\nSecond line')
    })
  })
})

describe('isAbortError edge cases', () => {
  describe('message matching with startsWith', () => {
    it('returns true for exact ABORT_ERROR_MESSAGE', () => {
      const error = new Error(ABORT_ERROR_MESSAGE)
      expect(isAbortError(error)).toBe(true)
    })

    it('returns true for message with suffix after ABORT_ERROR_MESSAGE (like AbortError with reason)', () => {
      // This is the format AbortError uses: 'Request aborted: reason'
      const error = new Error(`${ABORT_ERROR_MESSAGE}: timeout`)
      expect(isAbortError(error)).toBe(true)
    })

    it('returns false for message with non-colon suffix after ABORT_ERROR_MESSAGE', () => {
      // Only 'Request aborted' or 'Request aborted: <reason>' should match
      // Other patterns like 'Request aborted by user' should NOT match
      const error = new Error(`${ABORT_ERROR_MESSAGE} due to user action`)
      expect(isAbortError(error)).toBe(false)
    })

    it('returns false for message containing ABORT_ERROR_MESSAGE as substring (not prefix)', () => {
      const error = new Error(`Error: ${ABORT_ERROR_MESSAGE} by system`)
      expect(isAbortError(error)).toBe(false)
    })

    it('returns false for message with prefix before ABORT_ERROR_MESSAGE', () => {
      const error = new Error(`Something failed: ${ABORT_ERROR_MESSAGE}`)
      expect(isAbortError(error)).toBe(false)
    })
  })

  describe('case sensitivity', () => {
    it('returns false for lowercase version of message', () => {
      const error = new Error('request aborted')
      expect(isAbortError(error)).toBe(false)
    })

    it('returns false for uppercase version of message', () => {
      const error = new Error('REQUEST ABORTED')
      expect(isAbortError(error)).toBe(false)
    })

    it('returns false for mixed case version of message', () => {
      const error = new Error('Request Aborted')
      expect(isAbortError(error)).toBe(false)
    })
  })

  describe('AbortError name detection', () => {
    it('returns true for Error with name set to AbortError', () => {
      const error = new Error('Some other message')
      error.name = 'AbortError'
      expect(isAbortError(error)).toBe(true)
    })

    it('returns false for name containing AbortError as substring', () => {
      const error = new Error('test')
      error.name = 'MyAbortErrorClass'
      expect(isAbortError(error)).toBe(false)
    })

    it('returns false for lowercase aborterror name', () => {
      const error = new Error('test')
      error.name = 'aborterror'
      expect(isAbortError(error)).toBe(false)
    })
  })

  describe('DOMException handling', () => {
    it('returns true for DOMException with name AbortError', () => {
      const error = new DOMException('The operation was aborted', 'AbortError')
      expect(isAbortError(error)).toBe(true)
    })

    it('returns true for DOMException with signal abort message', () => {
      const error = new DOMException(
        'signal is aborted without reason',
        'AbortError',
      )
      expect(isAbortError(error)).toBe(true)
    })

    it('returns false for DOMException with different name', () => {
      const error = new DOMException('test', 'NotFoundError')
      expect(isAbortError(error)).toBe(false)
    })
  })

  describe('Error subclasses', () => {
    it('returns true for AbortError instance', () => {
      const error = new AbortError('test reason')
      expect(isAbortError(error)).toBe(true)
    })

    it('returns true for TypeError with AbortError name', () => {
      const error = new TypeError('test')
      error.name = 'AbortError'
      expect(isAbortError(error)).toBe(true)
    })

    it('returns false for custom error class without AbortError characteristics', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }
      // Note: Using a message that's similar but NOT exact match to ABORT_ERROR_MESSAGE
      const error = new CustomError('Request was aborted by user')
      expect(isAbortError(error)).toBe(false)
    })

    it('returns true for custom error class with AbortError name', () => {
      class MyAbortError extends Error {
        constructor() {
          super('custom message')
          this.name = 'AbortError'
        }
      }
      const error = new MyAbortError()
      expect(isAbortError(error)).toBe(true)
    })
  })

  describe('non-Error types', () => {
    it('returns false for string', () => {
      expect(isAbortError(ABORT_ERROR_MESSAGE)).toBe(false)
    })

    it('returns false for object with message property', () => {
      expect(isAbortError({ message: ABORT_ERROR_MESSAGE })).toBe(false)
    })

    it('returns false for object with name property', () => {
      expect(isAbortError({ name: 'AbortError' })).toBe(false)
    })

    it('returns false for null', () => {
      expect(isAbortError(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isAbortError(undefined)).toBe(false)
    })

    it('returns false for number', () => {
      expect(isAbortError(42)).toBe(false)
    })

    it('returns false for array', () => {
      expect(isAbortError([ABORT_ERROR_MESSAGE])).toBe(false)
    })

    it('returns false for function', () => {
      expect(isAbortError(() => ABORT_ERROR_MESSAGE)).toBe(false)
    })
  })
})

describe('unwrapPromptResult with AbortError', () => {
  describe('successful results', () => {
    it('returns value for successful result', () => {
      const result = promptSuccess('test value')
      expect(unwrapPromptResult(result)).toBe('test value')
    })

    it('returns null for successful null result', () => {
      const result = promptSuccess(null)
      expect(unwrapPromptResult(result)).toBeNull()
    })

    it('returns undefined for successful undefined result', () => {
      const result = promptSuccess(undefined)
      expect(unwrapPromptResult(result)).toBeUndefined()
    })

    it('returns complex object for successful result', () => {
      const value = { nested: { array: [1, 2, 3] } }
      const result = promptSuccess(value)
      expect(unwrapPromptResult(result)).toEqual(value)
    })
  })

  describe('aborted results throw AbortError', () => {
    it('throws AbortError instance', () => {
      const result = promptAborted()
      try {
        unwrapPromptResult(result)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error instanceof AbortError).toBe(true)
      }
    })

    it('thrown error has name AbortError', () => {
      const result = promptAborted()
      try {
        unwrapPromptResult(result)
        expect(true).toBe(false)
      } catch (error) {
        expect((error as Error).name).toBe('AbortError')
      }
    })

    it('thrown error includes reason in message', () => {
      const result = promptAborted('User cancelled')
      try {
        unwrapPromptResult(result)
        expect(true).toBe(false)
      } catch (error) {
        expect((error as Error).message).toBe('Request aborted: User cancelled')
      }
    })

    it('thrown error is detectable with isAbortError', () => {
      const result = promptAborted()
      try {
        unwrapPromptResult(result)
        expect(true).toBe(false)
      } catch (error) {
        expect(isAbortError(error)).toBe(true)
      }
    })

    it('thrown error with reason is detectable with isAbortError', () => {
      const result = promptAborted('timeout')
      try {
        unwrapPromptResult(result)
        expect(true).toBe(false)
      } catch (error) {
        expect(isAbortError(error)).toBe(true)
      }
    })
  })
})

describe('PromptResult integration patterns', () => {
  describe('early return pattern', () => {
    async function mockLlmCall(shouldAbort: boolean): Promise<PromptResult<string>> {
      if (shouldAbort) {
        return promptAborted('User cancelled')
      }
      return promptSuccess('LLM response')
    }

    async function callerWithEarlyReturn(shouldAbort: boolean): Promise<string | null> {
      const result = await mockLlmCall(shouldAbort)
      if (result.aborted) {
        return null
      }
      return result.value.toUpperCase()
    }

    it('returns transformed value on success', async () => {
      const result = await callerWithEarlyReturn(false)
      expect(result).toBe('LLM RESPONSE')
    })

    it('returns null on abort', async () => {
      const result = await callerWithEarlyReturn(true)
      expect(result).toBeNull()
    })
  })

  describe('unwrap with try/catch pattern', () => {
    async function mockLlmCall(shouldAbort: boolean): Promise<PromptResult<string>> {
      if (shouldAbort) {
        return promptAborted('Signal triggered')
      }
      return promptSuccess('Success response')
    }

    async function callerWithUnwrap(shouldAbort: boolean): Promise<string> {
      return unwrapPromptResult(await mockLlmCall(shouldAbort))
    }

    async function outerCaller(shouldAbort: boolean): Promise<{ result: string; wasAborted: boolean }> {
      try {
        const result = await callerWithUnwrap(shouldAbort)
        return { result, wasAborted: false }
      } catch (error) {
        if (isAbortError(error)) {
          return { result: '', wasAborted: true }
        }
        throw error // Rethrow non-abort errors
      }
    }

    it('returns result on success', async () => {
      const { result, wasAborted } = await outerCaller(false)
      expect(result).toBe('Success response')
      expect(wasAborted).toBe(false)
    })

    it('catches and identifies abort', async () => {
      const { result, wasAborted } = await outerCaller(true)
      expect(result).toBe('')
      expect(wasAborted).toBe(true)
    })
  })

  describe('nested function abort propagation', () => {
    async function deepestCall(signal: { aborted: boolean }): Promise<PromptResult<number>> {
      if (signal.aborted) {
        return promptAborted('Aborted at deepest level')
      }
      return promptSuccess(42)
    }

    async function middleCall(signal: { aborted: boolean }): Promise<PromptResult<string>> {
      const result = await deepestCall(signal)
      if (result.aborted) {
        return result // Propagate abort
      }
      return promptSuccess(`Value: ${result.value}`)
    }

    async function topCall(signal: { aborted: boolean }): Promise<PromptResult<string[]>> {
      const result = await middleCall(signal)
      if (result.aborted) {
        return result // Propagate abort
      }
      return promptSuccess([result.value, 'additional'])
    }

    it('propagates success through all levels', async () => {
      const signal = { aborted: false }
      const result = await topCall(signal)
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toEqual(['Value: 42', 'additional'])
      }
    })

    it('propagates abort from deepest level', async () => {
      const signal = { aborted: true }
      const result = await topCall(signal)
      expect(result.aborted).toBe(true)
      if (result.aborted) {
        expect(result.reason).toBe('Aborted at deepest level')
      }
    })
  })

  describe('mixed pattern with fallback', () => {
    async function primaryProvider(signal: { aborted: boolean }): Promise<PromptResult<string>> {
      if (signal.aborted) {
        return promptAborted()
      }
      // Simulate primary provider failure
      throw new Error('Primary provider unavailable')
    }

    async function fallbackProvider(signal: { aborted: boolean }): Promise<PromptResult<string>> {
      if (signal.aborted) {
        return promptAborted()
      }
      return promptSuccess('Fallback result')
    }

    async function callWithFallback(signal: { aborted: boolean }): Promise<PromptResult<string>> {
      try {
        const result = await primaryProvider(signal)
        // If aborted, don't try fallback
        if (result.aborted) {
          return result
        }
        return result
      } catch (error) {
        // Don't fall back on abort errors
        if (isAbortError(error)) {
          throw error
        }
        // Try fallback for other errors
        return fallbackProvider(signal)
      }
    }

    it('uses fallback on non-abort error', async () => {
      const signal = { aborted: false }
      const result = await callWithFallback(signal)
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toBe('Fallback result')
      }
    })

    it('does not use fallback on abort', async () => {
      const signal = { aborted: true }
      const result = await callWithFallback(signal)
      expect(result.aborted).toBe(true)
    })
  })

  describe('abort during async iteration', () => {
    async function* generateValues(signal: { aborted: boolean }): AsyncGenerator<PromptResult<number>> {
      for (let i = 0; i < 5; i++) {
        if (signal.aborted) {
          yield promptAborted(`Aborted at iteration ${i}`)
          return
        }
        yield promptSuccess(i)
      }
    }

    async function collectValues(signal: { aborted: boolean }): Promise<{ values: number[]; abortedAt?: string }> {
      const values: number[] = []
      for await (const result of generateValues(signal)) {
        if (result.aborted) {
          return { values, abortedAt: result.reason }
        }
        values.push(result.value)
      }
      return { values }
    }

    it('collects all values when not aborted', async () => {
      const signal = { aborted: false }
      const { values, abortedAt } = await collectValues(signal)
      expect(values).toEqual([0, 1, 2, 3, 4])
      expect(abortedAt).toBeUndefined()
    })

    it('stops iteration on abort', async () => {
      const signal = { aborted: false }
      // Simulate abort after first value
      const generator = generateValues(signal)
      const results: number[] = []
      
      for await (const result of generator) {
        if (result.aborted) break
        results.push(result.value)
        if (results.length === 2) {
          signal.aborted = true
        }
      }
      
      expect(results).toEqual([0, 1])
    })
  })

  describe('rethrow pattern in catch blocks', () => {
    async function innerOperation(): Promise<PromptResult<string>> {
      return promptAborted('Inner abort')
    }

    async function middleOperation(): Promise<string> {
      const result = await innerOperation()
      return unwrapPromptResult(result)
    }

    async function outerOperationBad(): Promise<string> {
      try {
        return await middleOperation()
      } catch (error) {
        // BAD: swallows abort error
        return 'default value'
      }
    }

    async function outerOperationGood(): Promise<string> {
      try {
        return await middleOperation()
      } catch (error) {
        // GOOD: rethrows abort error
        if (isAbortError(error)) {
          throw error
        }
        return 'default value'
      }
    }

    it('bad pattern swallows abort', async () => {
      const result = await outerOperationBad()
      // This shows the anti-pattern - abort was swallowed
      expect(result).toBe('default value')
    })

    it('good pattern propagates abort', async () => {
      await expect(outerOperationGood()).rejects.toThrow(ABORT_ERROR_MESSAGE)
    })

    it('good pattern rethrows AbortError that can be detected', async () => {
      try {
        await outerOperationGood()
        expect(true).toBe(false) // Should not reach
      } catch (error) {
        expect(isAbortError(error)).toBe(true)
      }
    })
  })
})

describe('ABORT_ERROR_MESSAGE constant', () => {
  it('has expected value', () => {
    expect(ABORT_ERROR_MESSAGE).toBe('Request aborted')
  })

  it('is used by AbortError class', () => {
    const error = new AbortError()
    expect(error.message).toBe(ABORT_ERROR_MESSAGE)
  })

  it('is detected by isAbortError', () => {
    const error = new Error(ABORT_ERROR_MESSAGE)
    expect(isAbortError(error)).toBe(true)
  })
})

describe('AbortController integration', () => {
  describe('signal.aborted check pattern', () => {
    async function mockLlmCallWithSignal(signal: AbortSignal): Promise<PromptResult<string>> {
      if (signal.aborted) {
        return promptAborted('Signal was already aborted')
      }
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (signal.aborted) {
        return promptAborted('Signal aborted during operation')
      }
      return promptSuccess('Operation completed')
    }

    it('returns success when signal is not aborted', async () => {
      const controller = new AbortController()
      const result = await mockLlmCallWithSignal(controller.signal)
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toBe('Operation completed')
      }
    })

    it('returns aborted when signal is pre-aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      const result = await mockLlmCallWithSignal(controller.signal)
      expect(result.aborted).toBe(true)
      if (result.aborted) {
        expect(result.reason).toBe('Signal was already aborted')
      }
    })
  })

  describe('sequential operations with abort', () => {
    const callLog: string[] = []

    async function step1(signal: AbortSignal): Promise<PromptResult<string>> {
      callLog.push('step1')
      if (signal.aborted) return promptAborted('step1 aborted')
      return promptSuccess('step1 result')
    }

    async function step2(signal: AbortSignal): Promise<PromptResult<string>> {
      callLog.push('step2')
      if (signal.aborted) return promptAborted('step2 aborted')
      return promptSuccess('step2 result')
    }

    async function step3(signal: AbortSignal): Promise<PromptResult<string>> {
      callLog.push('step3')
      if (signal.aborted) return promptAborted('step3 aborted')
      return promptSuccess('step3 result')
    }

    async function runSequentialSteps(signal: AbortSignal): Promise<PromptResult<string[]>> {
      const results: string[] = []

      const r1 = await step1(signal)
      if (r1.aborted) return r1
      results.push(r1.value)

      const r2 = await step2(signal)
      if (r2.aborted) return r2
      results.push(r2.value)

      const r3 = await step3(signal)
      if (r3.aborted) return r3
      results.push(r3.value)

      return promptSuccess(results)
    }

    it('completes all steps when not aborted', async () => {
      callLog.length = 0
      const controller = new AbortController()
      const result = await runSequentialSteps(controller.signal)
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toEqual(['step1 result', 'step2 result', 'step3 result'])
      }
      expect(callLog).toEqual(['step1', 'step2', 'step3'])
    })

    it('stops at first step when pre-aborted', async () => {
      callLog.length = 0
      const controller = new AbortController()
      controller.abort()
      const result = await runSequentialSteps(controller.signal)
      expect(result.aborted).toBe(true)
      // Only step1 should be called, and it should return aborted immediately
      expect(callLog).toEqual(['step1'])
    })
  })

  describe('fallback should NOT occur on abort (user intent)', () => {
    let fallbackCalled = false

    async function primaryModel(signal: AbortSignal): Promise<PromptResult<string>> {
      if (signal.aborted) {
        return promptAborted('User cancelled')
      }
      return promptSuccess('Primary model response')
    }

    async function fallbackModel(signal: AbortSignal): Promise<PromptResult<string>> {
      fallbackCalled = true
      if (signal.aborted) {
        return promptAborted('User cancelled')
      }
      return promptSuccess('Fallback model response')
    }

    async function callWithFallbackOnError(
      signal: AbortSignal,
      primaryShouldThrowError: boolean,
      primaryShouldAbort: boolean,
    ): Promise<PromptResult<string>> {
      try {
        if (primaryShouldThrowError) {
          throw new Error('Primary provider unavailable')
        }
        const primaryResult = primaryShouldAbort
          ? promptAborted('User cancelled primary')
          : await primaryModel(signal)

        // Key pattern: if aborted, do NOT fall back - abort represents user intent
        if (primaryResult.aborted) {
          return primaryResult
        }
        return primaryResult
      } catch (error) {
        // Don't fall back on abort errors
        if (isAbortError(error)) {
          throw error
        }
        // Try fallback for other errors
        return fallbackModel(signal)
      }
    }

    it('returns primary result when not aborted', async () => {
      fallbackCalled = false
      const controller = new AbortController()
      const result = await callWithFallbackOnError(controller.signal, false, false)
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toBe('Primary model response')
      }
      expect(fallbackCalled).toBe(false)
    })

    it('propagates abort without fallback (respects user intent)', async () => {
      fallbackCalled = false
      const controller = new AbortController()
      const result = await callWithFallbackOnError(controller.signal, false, true)
      expect(result.aborted).toBe(true)
      // Verify fallback was never called - abort means user wants to stop, not retry
      expect(fallbackCalled).toBe(false)
    })

    it('uses fallback on non-abort error', async () => {
      fallbackCalled = false
      const controller = new AbortController()
      const result = await callWithFallbackOnError(controller.signal, true, false)
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toBe('Fallback model response')
      }
      // Verify fallback WAS called for non-abort error
      expect(fallbackCalled).toBe(true)
    })
  })

  describe('DOMException from AbortController', () => {
    it('native abort reason is detected by isAbortError', () => {
      const controller = new AbortController()
      controller.abort()
      // When you call controller.abort(), signal.reason becomes a DOMException
      // with name 'AbortError'
      const reason = controller.signal.reason
      expect(reason).toBeInstanceOf(DOMException)
      expect(isAbortError(reason)).toBe(true)
    })

    it('custom abort reason string is not detected as AbortError', () => {
      const controller = new AbortController()
      controller.abort('custom reason string')
      // When you provide a reason, signal.reason is that value, not a DOMException
      const reason = controller.signal.reason
      expect(isAbortError(reason)).toBe(false) // string is not an Error
    })

    it('custom abort reason Error with AbortError name is detected', () => {
      const controller = new AbortController()
      const customAbortError = new AbortError('custom abort')
      controller.abort(customAbortError)
      const reason = controller.signal.reason
      expect(isAbortError(reason)).toBe(true)
    })
  })
})
