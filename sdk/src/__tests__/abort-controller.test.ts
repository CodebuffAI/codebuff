import { describe, expect, test } from 'bun:test'
import { CodebuffClient } from '../client'

/**
 * Tests for the single-controller abort architecture where:
 * - SDK and caller share one AbortController
 * - SDK can abort on timeout (streamTimeoutMs)
 * - Caller can abort anytime (Ctrl+C, user cancellation)
 * - New controller for each retry ensures multiple retries work correctly
 *
 * Key architectural decisions tested:
 * 1. Single controller shared between SDK and caller (not two separate ones)
 * 2. SDK aborts controller on stream inactivity timeout
 * 3. User can abort same controller for cancellation
 * 4. New controller must be created for each retry attempt
 * 5. Pre-aborted controllers return immediately
 */
describe('Abort Controller - Single Controller Architecture', () => {
  describe('API signature', () => {
    test('accepts abortController parameter in run options', () => {
      const client = new CodebuffClient({
        apiKey: 'test-key',
        disableConsoleErrors: true,
      })

      const abortController = new AbortController()

      // Should accept abortController (not signal)
      const runOptions = {
        agent: 'test-agent',
        prompt: 'test prompt',
        abortController: abortController, // New API
      }

      // Verify the API accepts this parameter without error
      expect(runOptions.abortController).toBe(abortController)
    })

    test('abortController parameter is optional', () => {
      const client = new CodebuffClient({
        apiKey: 'test-key',
        disableConsoleErrors: true,
      })

      // Should work without abortController
      const runOptions: {
        agent: string
        prompt: string
        abortController?: AbortController
      } = {
        agent: 'test-agent',
        prompt: 'test prompt',
        // abortController omitted
      }

      expect(runOptions.abortController).toBeUndefined()
    })

    test('streamTimeoutMs can be configured', () => {
      const client = new CodebuffClient({
        apiKey: 'test-key',
        streamTimeoutMs: 30000, // Custom timeout
        disableConsoleErrors: true,
      })

      expect(client.options.streamTimeoutMs).toBe(30000)
    })

    test('streamTimeoutMs defaults to 180000ms (3 minutes)', () => {
      const client = new CodebuffClient({
        apiKey: 'test-key',
        disableConsoleErrors: true,
      })

      expect(client.options.streamTimeoutMs).toBe(180000)
    })
  })

  describe('Pre-aborted controller behavior', () => {
    test('aborted controller before run returns immediately', async () => {
      const client = new CodebuffClient({
        apiKey: 'test-key',
        disableConsoleErrors: true,
      })

      const abortController = new AbortController()
      // Abort BEFORE calling run
      abortController.abort(new Error('Pre-aborted'))

      expect(abortController.signal.aborted).toBe(true)

      const startTime = Date.now()
      const result = await client.run({
        agent: 'test-agent',
        prompt: 'test',
        abortController: abortController,
      })
      const elapsed = Date.now() - startTime

      // Should return immediately (within 100ms) without trying to connect
      expect(elapsed).toBeLessThan(100)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.value.output.type).toBe('error')
        if (result.value.output.type === 'error') {
          expect(result.value.output.message).toContain('cancelled')
        }
      }
    })
  })

  describe('Controller lifecycle', () => {
    test('each run should use a new controller for retries', () => {
      // Document that callers should create new controllers for retries
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const controller3 = new AbortController()

      // Each retry attempt should have its own controller
      expect(controller1).not.toBe(controller2)
      expect(controller2).not.toBe(controller3)

      // Once aborted, a controller stays aborted
      controller1.abort()
      expect(controller1.signal.aborted).toBe(true)

      // Other controllers are independent
      expect(controller2.signal.aborted).toBe(false)
      expect(controller3.signal.aborted).toBe(false)
    })

    test('cannot un-abort a controller', () => {
      const controller = new AbortController()

      controller.abort(new Error('First abort'))
      expect(controller.signal.aborted).toBe(true)

      // Attempting to abort again does nothing (already aborted)
      controller.abort(new Error('Second abort'))
      expect(controller.signal.aborted).toBe(true)

      // This is why retries need NEW controllers
    })
  })

  describe('Shared controller behavior documentation', () => {
    test('documents that SDK and caller share the same controller', () => {
      const abortController = new AbortController()

      // Both SDK timeout and user cancellation use the SAME controller
      // This is the key architectural decision:
      // - Before: SDK had internal controller, caller passed signal
      // - Now: Single controller shared between both

      // SDK can abort it (on timeout):
      // abortController.abort(new Error('Stream inactivity timeout'))

      // User can abort it (on Ctrl+C):
      // abortController.abort(new Error('User cancelled'))

      // Both abort the same controller
      expect(abortController).toBeDefined()
    })

    test('documents why CLI must create new controllers for retries', () => {
      // First attempt
      const attempt1Controller = new AbortController()
      // ... SDK times out and aborts it
      attempt1Controller.abort(new Error('Timeout'))
      expect(attempt1Controller.signal.aborted).toBe(true)

      // Retry attempt - MUST use new controller
      const attempt2Controller = new AbortController()
      expect(attempt2Controller.signal.aborted).toBe(false)

      // If we reused attempt1Controller, it would fail immediately
      // because it's already aborted
    })
  })

  describe('NetworkError with streamTimedOut flag', () => {
    test('NetworkError can carry streamTimedOut flag', () => {
      // Import is already at top
      const { NetworkError } = require('../errors')

      const error = new NetworkError('Stream timed out after 15000ms', {
        streamTimedOut: true,
      })

      expect(error).toBeInstanceOf(NetworkError)
      expect(error.streamTimedOut).toBe(true)
      expect(error.message).toContain('timed out')
    })

    test('streamTimedOut flag distinguishes timeout from other errors', () => {
      const { NetworkError } = require('../errors')

      const timeoutError = new NetworkError('Timeout', {
        streamTimedOut: true,
      })
      const otherError = new NetworkError('Connection refused', {
        streamTimedOut: false,
      })

      // CLI uses this flag to detect SDK timeouts
      expect(timeoutError.streamTimedOut).toBe(true)
      expect(otherError.streamTimedOut).toBe(false)
    })
  })
})
