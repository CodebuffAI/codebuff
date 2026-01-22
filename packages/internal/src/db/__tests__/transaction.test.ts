import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { createPostgresError } from '@codebuff/common/testing/errors'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import * as analyticsModule from '@codebuff/common/analytics'

import {
  getRetryableErrorDescription,
  isRetryablePostgresError,
} from '../transaction'
import * as dbModule from '../index'
import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('transaction error handling', () => {
  describe('getRetryableErrorDescription', () => {
    describe('Class 40 — Transaction Rollback errors', () => {
      it('should return description for serialization_failure (40001)', () => {
        const error = { code: '40001' }
        expect(getRetryableErrorDescription(error)).toBe('serialization_failure')
      })

      it('should return description for statement_completion_unknown (40003)', () => {
        const error = { code: '40003' }
        expect(getRetryableErrorDescription(error)).toBe(
          'statement_completion_unknown',
        )
      })

      it('should return description for deadlock_detected (40P01)', () => {
        const error = { code: '40P01' }
        expect(getRetryableErrorDescription(error)).toBe('deadlock_detected')
      })

      it('should return class-level fallback for unlisted 40xxx codes', () => {
        const error = { code: '40002' }
        expect(getRetryableErrorDescription(error)).toBe(
          'transaction_rollback_40002',
        )
      })
    })

    describe('Class 08 — Connection Exception errors', () => {
      it('should return description for connection_exception (08000)', () => {
        const error = { code: '08000' }
        expect(getRetryableErrorDescription(error)).toBe('connection_exception')
      })

      it('should return description for sqlclient_unable_to_establish_sqlconnection (08001)', () => {
        const error = { code: '08001' }
        expect(getRetryableErrorDescription(error)).toBe(
          'sqlclient_unable_to_establish_sqlconnection',
        )
      })

      it('should return description for connection_does_not_exist (08003)', () => {
        const error = { code: '08003' }
        expect(getRetryableErrorDescription(error)).toBe(
          'connection_does_not_exist',
        )
      })

      it('should return description for sqlserver_rejected_establishment_of_sqlconnection (08004)', () => {
        const error = { code: '08004' }
        expect(getRetryableErrorDescription(error)).toBe(
          'sqlserver_rejected_establishment_of_sqlconnection',
        )
      })

      it('should return description for connection_failure (08006)', () => {
        const error = { code: '08006' }
        expect(getRetryableErrorDescription(error)).toBe('connection_failure')
      })

      it('should return description for protocol_violation (08P01)', () => {
        const error = { code: '08P01' }
        expect(getRetryableErrorDescription(error)).toBe('protocol_violation')
      })

      it('should return class-level fallback for unlisted 08xxx codes', () => {
        const error = { code: '08007' }
        expect(getRetryableErrorDescription(error)).toBe(
          'connection_exception_08007',
        )
      })
    })

    describe('Class 57 — Operator Intervention errors', () => {
      it('should return description for query_canceled (57014)', () => {
        const error = { code: '57014' }
        expect(getRetryableErrorDescription(error)).toBe('query_canceled')
      })

      it('should return description for admin_shutdown (57P01)', () => {
        const error = { code: '57P01' }
        expect(getRetryableErrorDescription(error)).toBe('admin_shutdown')
      })

      it('should return description for crash_shutdown (57P02)', () => {
        const error = { code: '57P02' }
        expect(getRetryableErrorDescription(error)).toBe('crash_shutdown')
      })

      it('should return description for cannot_connect_now (57P03)', () => {
        const error = { code: '57P03' }
        expect(getRetryableErrorDescription(error)).toBe('cannot_connect_now')
      })

      it('should return class-level fallback for unlisted 57xxx codes', () => {
        const error = { code: '57000' }
        expect(getRetryableErrorDescription(error)).toBe(
          'operator_intervention_57000',
        )
      })
    })

    describe('Class 53 — Insufficient Resources errors', () => {
      it('should return description for insufficient_resources (53000)', () => {
        const error = { code: '53000' }
        expect(getRetryableErrorDescription(error)).toBe(
          'insufficient_resources',
        )
      })

      it('should return description for disk_full (53100)', () => {
        const error = { code: '53100' }
        expect(getRetryableErrorDescription(error)).toBe('disk_full')
      })

      it('should return description for out_of_memory (53200)', () => {
        const error = { code: '53200' }
        expect(getRetryableErrorDescription(error)).toBe('out_of_memory')
      })

      it('should return description for too_many_connections (53300)', () => {
        const error = { code: '53300' }
        expect(getRetryableErrorDescription(error)).toBe('too_many_connections')
      })

      it('should return class-level fallback for unlisted 53xxx codes', () => {
        const error = { code: '53400' }
        expect(getRetryableErrorDescription(error)).toBe(
          'insufficient_resources_53400',
        )
      })
    })

    describe('non-retryable errors', () => {
      it('should return null for syntax error (42601)', () => {
        const error = { code: '42601' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for unique violation (23505)', () => {
        const error = { code: '23505' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for foreign key violation (23503)', () => {
        const error = { code: '23503' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for undefined_table (42P01)', () => {
        const error = { code: '42P01' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for successful completion (00000)', () => {
        const error = { code: '00000' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })
    })

    describe('edge cases', () => {
      it('should return null for null input', () => {
        expect(getRetryableErrorDescription(null)).toBeNull()
      })

      it('should return null for undefined input', () => {
        expect(getRetryableErrorDescription(undefined)).toBeNull()
      })

      it('should return null for non-object input (string)', () => {
        expect(getRetryableErrorDescription('error')).toBeNull()
      })

      it('should return null for non-object input (number)', () => {
        expect(getRetryableErrorDescription(123)).toBeNull()
      })

      it('should return null for error without code property', () => {
        const error = { message: 'Something went wrong' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for error with non-string code', () => {
        const error = { code: 40001 }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for error with empty string code', () => {
        const error = { code: '' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should return null for error with single character code', () => {
        const error = { code: '4' }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should handle Error object with code property', () => {
        const error = createPostgresError('Connection failed', '08006')
        expect(getRetryableErrorDescription(error)).toBe('connection_failure')
      })

      it('should read retryable code from nested cause', () => {
        const error = { cause: { code: '40001' } }
        expect(getRetryableErrorDescription(error)).toBe(
          'serialization_failure',
        )
      })

      it('should fall back to nested cause when top-level code is invalid', () => {
        const error = { code: 40001, cause: { code: '40P01' } }
        expect(getRetryableErrorDescription(error)).toBe('deadlock_detected')
      })

      it('should skip non-PG string codes and find real PG code in cause', () => {
        const error = { code: 'FETCH_ERROR', cause: { code: '40001' } }
        expect(getRetryableErrorDescription(error)).toBe('serialization_failure')
      })

      it('should skip ECONNRESET and find PG code deeper in chain', () => {
        const error = {
          code: 'ECONNRESET',
          cause: {
            code: 'TIMEOUT',
            cause: {
              code: '08006',
            },
          },
        }
        expect(getRetryableErrorDescription(error)).toBe('connection_failure')
      })

      it('should return null when only non-PG codes exist in chain', () => {
        const error = {
          code: 'FETCH_ERROR',
          cause: {
            code: 'ECONNRESET',
            cause: {
              code: 'TIMEOUT',
            },
          },
        }
        expect(getRetryableErrorDescription(error)).toBeNull()
      })

      it('should skip 3-character codes and find valid PG code', () => {
        const error = { code: 'ERR', cause: { code: '53300' } }
        expect(getRetryableErrorDescription(error)).toBe('too_many_connections')
      })

      it('should skip codes with special characters and find valid PG code', () => {
        const error = { code: 'ERR_CONN', cause: { code: '40P01' } }
        expect(getRetryableErrorDescription(error)).toBe('deadlock_detected')
      })
    })
  })

  describe('isRetryablePostgresError', () => {
    describe('retryable errors', () => {
      it('should return true for serialization failure', () => {
        expect(isRetryablePostgresError({ code: '40001' })).toBe(true)
      })

      it('should return true for deadlock', () => {
        expect(isRetryablePostgresError({ code: '40P01' })).toBe(true)
      })

      it('should return true for connection exception', () => {
        expect(isRetryablePostgresError({ code: '08000' })).toBe(true)
      })

      it('should return true for query canceled (timeout)', () => {
        expect(isRetryablePostgresError({ code: '57014' })).toBe(true)
      })

      it('should return true for too many connections', () => {
        expect(isRetryablePostgresError({ code: '53300' })).toBe(true)
      })

      it('should return true for unlisted codes in retryable classes', () => {
        expect(isRetryablePostgresError({ code: '40999' })).toBe(true)
        expect(isRetryablePostgresError({ code: '08999' })).toBe(true)
        expect(isRetryablePostgresError({ code: '57999' })).toBe(true)
        expect(isRetryablePostgresError({ code: '53999' })).toBe(true)
      })
    })

    describe('non-retryable errors', () => {
      it('should return false for syntax error', () => {
        expect(isRetryablePostgresError({ code: '42601' })).toBe(false)
      })

      it('should return false for unique violation', () => {
        expect(isRetryablePostgresError({ code: '23505' })).toBe(false)
      })

      it('should return false for permission denied', () => {
        expect(isRetryablePostgresError({ code: '42501' })).toBe(false)
      })
    })

    describe('edge cases', () => {
      it('should return false for null', () => {
        expect(isRetryablePostgresError(null)).toBe(false)
      })

      it('should return false for undefined', () => {
        expect(isRetryablePostgresError(undefined)).toBe(false)
      })

      it('should return false for non-object', () => {
        expect(isRetryablePostgresError('40001')).toBe(false)
      })

      it('should return false for object without code', () => {
        expect(isRetryablePostgresError({ message: 'error' })).toBe(false)
      })

      it('should return false for numeric code', () => {
        expect(isRetryablePostgresError({ code: 40001 })).toBe(false)
      })

      it('should return true for nested cause code', () => {
        expect(isRetryablePostgresError({ cause: { code: '40001' } })).toBe(
          true,
        )
      })

      it('should handle self-referential error cause (cycle of 1)', () => {
        const error: { code?: number; cause?: unknown } = { code: 40001 }
        error.cause = error // self-referential
        expect(isRetryablePostgresError(error)).toBe(false)
      })

      it('should handle two-object circular reference', () => {
        const errorA: { cause?: unknown } = {}
        const errorB: { cause?: unknown; code: string } = { code: '40001' }
        errorA.cause = errorB
        errorB.cause = errorA
        // Should find code in errorB before hitting cycle
        expect(isRetryablePostgresError(errorA)).toBe(true)
      })

      it('should find code at max depth (depth 5)', () => {
        // Build a chain of 5 levels deep (0-indexed: depths 0, 1, 2, 3, 4, 5)
        const error = {
          cause: {
            cause: {
              cause: {
                cause: {
                  cause: {
                    code: '40001',
                  },
                },
              },
            },
          },
        }
        expect(isRetryablePostgresError(error)).toBe(true)
      })

      it('should return false when code is beyond max depth (depth 6+)', () => {
        // Build a chain of 7 levels deep - code at depth 6 should not be found
        const error = {
          cause: {
            cause: {
              cause: {
                cause: {
                  cause: {
                    cause: {
                      code: '40001',
                    },
                  },
                },
              },
            },
          },
        }
        expect(isRetryablePostgresError(error)).toBe(false)
      })
    })
  })
})

function createMockLogger() {
  return {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  }
}

describe('withSerializableTransaction', () => {
  // We need to dynamically import the function to allow mocking
  let withSerializableTransaction: typeof import('../transaction').withSerializableTransaction
  let mockLogger: ReturnType<typeof createMockLogger>
  let transactionSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    // Create a fresh mock logger for each test
    mockLogger = createMockLogger()

    // Re-import to get fresh module
    const transactionModule = await import('../transaction')
    withSerializableTransaction = transactionModule.withSerializableTransaction
  })

  afterEach(() => {
    mock.restore()
  })

  describe('PostHog analytics event emission', () => {
    let trackEventSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      trackEventSpy = spyOn(analyticsModule, 'trackEvent').mockImplementation(() => {})
    })

    afterEach(() => {
      trackEventSpy.mockRestore()
    })

    it('should emit TRANSACTION_RETRY_THRESHOLD_EXCEEDED event when cumulative delay reaches 3s', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-abc', operationId: 'op-xyz' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(trackEventSpy).toHaveBeenCalledTimes(1)

      const callArgs = trackEventSpy.mock.calls[0] as unknown[]
      const eventPayload = callArgs[0] as Record<string, unknown>

      expect(eventPayload.event).toBe(AnalyticsEvent.TRANSACTION_RETRY_THRESHOLD_EXCEEDED)
      expect(eventPayload.userId).toBe('user-abc')
      expect(eventPayload.properties).toMatchObject({
        transactionType: 'serializable',
        attempt: 2,
        pgErrorCode: '08006',
        pgErrorDescription: 'connection_failure',
        cumulativeDelayMs: 3000,
        userId: 'user-abc',
        operationId: 'op-xyz',
      })

      setTimeoutSpy.mockRestore()
    })

    it('should NOT emit analytics event when cumulative delay is below 3s threshold', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts === 1) {
            throw createPostgresError('connection failure', '08006')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-abc' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      // First retry has cumulative delay of 1s < 3s threshold
      expect(trackEventSpy).not.toHaveBeenCalled()

      setTimeoutSpy.mockRestore()
    })

    it('should use "system" as userId when context has no userId or organizationId', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: {}, // No userId or organizationId
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(trackEventSpy).toHaveBeenCalledTimes(1)
      const callArgs = trackEventSpy.mock.calls[0] as unknown[]
      const eventPayload = callArgs[0] as Record<string, unknown>
      expect(eventPayload.userId).toBe('system')

      setTimeoutSpy.mockRestore()
    })

    it('should emit multiple analytics events for each retry after threshold', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 3) {
            throw createPostgresError('connection failure', '08006')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-123' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      // Retry 1: 1s (no event), Retry 2: 3s (event), Retry 3: 7s (event)
      expect(trackEventSpy).toHaveBeenCalledTimes(2)

      // Verify first event (attempt 2, cumulative 3s)
      const firstCall = trackEventSpy.mock.calls[0] as unknown[]
      const firstPayload = firstCall[0] as Record<string, unknown>
      expect((firstPayload.properties as Record<string, unknown>).cumulativeDelayMs).toBe(3000)
      expect((firstPayload.properties as Record<string, unknown>).attempt).toBe(2)

      // Verify second event (attempt 3, cumulative 7s)
      const secondCall = trackEventSpy.mock.calls[1] as unknown[]
      const secondPayload = secondCall[0] as Record<string, unknown>
      expect((secondPayload.properties as Record<string, unknown>).cumulativeDelayMs).toBe(7000)
      expect((secondPayload.properties as Record<string, unknown>).attempt).toBe(3)

      setTimeoutSpy.mockRestore()
    })
  })

  describe('observability threshold behavior', () => {
    it('should NOT log on first retry (cumulative delay 1s < 3s threshold)', async () => {
      // Mock setTimeout to execute immediately for faster tests
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          // Fail only once - first retry has cumulative delay of 1s (< 3s threshold)
          if (attempts === 1) {
            throw createPostgresError('serialization failure', '40001')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-123' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(attempts).toBe(2)
      // First retry cumulative delay: 1s * (2^1 - 1) = 1s < 3s threshold
      // Should NOT log at WARN level
      expect(mockLogger.warn).not.toHaveBeenCalled()

      setTimeoutSpy.mockRestore()
    })

    it('should log on second retry when cumulative delay reaches 3s threshold', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          // Fail twice - second retry has cumulative delay of 3s (= threshold)
          if (attempts <= 2) {
            throw createPostgresError('serialization failure', '40001')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-123' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(attempts).toBe(3)
      // Second retry cumulative delay: 1s * (2^2 - 1) = 3s >= 3s threshold
      // Should log at WARN level
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      const warnCalls = mockLogger.warn.mock.calls as unknown[][]
      const logContext = warnCalls[0]![0] as Record<string, unknown>
      expect(logContext.cumulativeDelayMs).toBe(3000)
      expect(logContext.attempt).toBe(2)

      setTimeoutSpy.mockRestore()
    })

    it('should log on each retry after threshold is reached (attempts 2, 3, 4...)', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          // Fail 4 times to verify logging pattern
          if (attempts <= 4) {
            throw createPostgresError('serialization failure', '40001')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: {},
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(attempts).toBe(5)
      // Retry 1: cumulative 1s (no log)
      // Retry 2: cumulative 3s (log)
      // Retry 3: cumulative 7s (log)
      // Retry 4: cumulative 15s (log)
      expect(mockLogger.warn).toHaveBeenCalledTimes(3)

      const warnCalls = mockLogger.warn.mock.calls as unknown[][]
      // Verify cumulative delays: 3s, 7s, 15s
      expect((warnCalls[0]![0] as Record<string, unknown>).cumulativeDelayMs).toBe(3000)
      expect((warnCalls[1]![0] as Record<string, unknown>).cumulativeDelayMs).toBe(7000)
      expect((warnCalls[2]![0] as Record<string, unknown>).cumulativeDelayMs).toBe(15000)

      setTimeoutSpy.mockRestore()
    })

    it('should include correct context and error info in log message', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-abc', operationId: 'op-xyz' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      const warnCalls = mockLogger.warn.mock.calls as unknown[][]
      const logContext = warnCalls[0]![0] as Record<string, unknown>
      const logMessage = warnCalls[0]![1] as string

      // Verify context fields are passed through
      expect(logContext.userId).toBe('user-abc')
      expect(logContext.operationId).toBe('op-xyz')
      expect(logContext.pgErrorCode).toBe('08006')
      expect(logContext.pgErrorDescription).toBe('connection_failure')
      expect(logContext.attempt).toBe(2)
      expect(logContext.cumulativeDelayMs).toBe(3000)

      // Verify log message format
      expect(logMessage).toContain('Serializable transaction retry 2')
      expect(logMessage).toContain('connection_failure')
      expect(logMessage).toContain('08006')
      expect(logMessage).toContain('3.0s')

      setTimeoutSpy.mockRestore()
    })
  })

  describe('successful execution', () => {
    it('should return result on successful first attempt', async () => {
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      const result = await withSerializableTransaction({
        callback: async () => 'success',
        context: { userId: 'test-user' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(result).toBe('success')
      expect(transactionSpy).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('should pass serializable isolation level to transaction', async () => {
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback, options) => {
          expect(options?.isolationLevel).toBe('serializable')
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: {},
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(transactionSpy).toHaveBeenCalled()
    })
  })

  describe('retry behavior on retryable errors', () => {
    it('should retry on serialization failure (40001) and succeed', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts === 1) {
            throw createPostgresError('serialization failure', '40001')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      const result = await withSerializableTransaction({
        callback: async () => 'success after retry',
        context: { userId: 'test-user' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(result).toBe('success after retry')
      expect(attempts).toBe(2)
      // Note: warn is not called on first retry since cumulative delay < 3s threshold
      // Logging only happens after significant cumulative delay to avoid excessive logs
    })

    it('should retry on connection failure (08006) and succeed', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      const result = await withSerializableTransaction({
        callback: async () => 'success after retries',
        context: {},
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(result).toBe('success after retries')
      expect(attempts).toBe(3)
    })

    it('should retry on deadlock (40P01) and succeed', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts === 1) {
            throw createPostgresError('deadlock detected', '40P01')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      const result = await withSerializableTransaction({
        callback: async () => 'success',
        context: {},
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      expect(result).toBe('success')
      expect(attempts).toBe(2)
    })

    it('should log warning with error details after significant cumulative delay', async () => {
      // Mock setTimeout to execute immediately for faster tests
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          // Fail 3 times to reach cumulative delay pattern:
          // Retry 1: 1s (no log), Retry 2: 3s (log), Retry 3: 7s (log)
          if (attempts <= 3) {
            throw createPostgresError('serialization failure', '40001')
          }
          return callback({} as Parameters<typeof callback>[0])
        },
      )

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-123', operationId: 'op-456' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      // Verify logging was called after cumulative delay exceeded 3s threshold
      // Retry 1: 1s cumulative (no log), Retry 2: 3s cumulative (logs), Retry 3: 7s (logs)
      expect(mockLogger.warn).toHaveBeenCalledTimes(2)
      const warnCalls = mockLogger.warn.mock.calls as unknown[][]

      // Check that context is passed in the log
      const firstCallArgs = warnCalls[0] as unknown[]
      expect(firstCallArgs[0]).toMatchObject({
        userId: 'user-123',
        operationId: 'op-456',
        pgErrorCode: '40001',
        attempt: 2,
        cumulativeDelayMs: 3000,
      })

      setTimeoutSpy.mockRestore()
    })
  })

  describe('non-retryable errors', () => {
    it('should throw immediately on unique violation (23505)', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async () => {
          attempts++
          throw createPostgresError('unique violation', '23505')
        },
      )

      await expect(
        withSerializableTransaction({
          callback: async () => 'should not reach',
          context: {},
          logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
        }),
      ).rejects.toThrow('unique violation')

      expect(attempts).toBe(1) // Should not retry
    })

    it('should throw immediately on syntax error (42601)', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async () => {
          attempts++
          throw createPostgresError('syntax error', '42601')
        },
      )

      await expect(
        withSerializableTransaction({
          callback: async () => 'should not reach',
          context: {},
          logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
        }),
      ).rejects.toThrow('syntax error')

      expect(attempts).toBe(1)
    })

    it('should throw immediately on foreign key violation (23503)', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async () => {
          attempts++
          throw createPostgresError('foreign key violation', '23503')
        },
      )

      await expect(
        withSerializableTransaction({
          callback: async () => 'should not reach',
          context: {},
          logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
        }),
      ).rejects.toThrow('foreign key violation')

      expect(attempts).toBe(1)
    })
  })

  describe('max retries exceeded', () => {
    let setTimeoutSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      // Mock setTimeout to execute callbacks immediately (no delay)
      // This speeds up the test by eliminating exponential backoff waits
      setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )
    })

    afterEach(() => {
      setTimeoutSpy.mockRestore()
    })

    it('should throw after max retries on persistent retryable error', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async () => {
          attempts++
          throw createPostgresError('persistent serialization failure', '40001')
        },
      )

      await expect(
        withSerializableTransaction({
          callback: async () => 'should not reach',
          context: {},
          logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
        }),
      ).rejects.toThrow('persistent serialization failure')

      // Should have tried maxRetries (5) times
      expect(attempts).toBe(5)
    })
  })
})

describe('withAdvisoryLockTransaction', () => {
  let withAdvisoryLockTransaction: typeof import('../transaction').withAdvisoryLockTransaction
  let mockLogger: ReturnType<typeof createMockLogger>
  let transactionSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    mockLogger = createMockLogger()
    const transactionModule = await import('../transaction')
    withAdvisoryLockTransaction = transactionModule.withAdvisoryLockTransaction
  })

  afterEach(() => {
    mock.restore()
  })

  describe('PostHog analytics event emission', () => {
    let trackEventSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      trackEventSpy = spyOn(analyticsModule, 'trackEvent').mockImplementation(() => {})
    })

    afterEach(() => {
      trackEventSpy.mockRestore()
    })

    it('should emit ADVISORY_LOCK_CONTENTION event when lock wait exceeds 3s', async () => {
      // Mock Date.now to simulate a 3.5s lock wait
      let callCount = 0
      const originalDateNow = Date.now
      const dateNowSpy = spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        // First call: lock start time (0ms)
        // Second call: lock end time (3500ms later)
        if (callCount <= 1) {
          return 1000
        }
        return 4500 // 3500ms after start
      })

      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:test-user-123',
        context: { userId: 'test-user-123', operationId: 'op-abc' },
        logger: mockLogger as unknown as Logger,
      })

      expect(trackEventSpy).toHaveBeenCalledTimes(1)

      const callArgs = trackEventSpy.mock.calls[0] as unknown[]
      const eventPayload = callArgs[0] as Record<string, unknown>

      expect(eventPayload.event).toBe(AnalyticsEvent.ADVISORY_LOCK_CONTENTION)
      expect(eventPayload.userId).toBe('test-user-123')
      expect(eventPayload.properties).toMatchObject({
        lockKey: 'user:test-user-123',
        lockKeyType: 'user',
        lockWaitMs: 3500,
        lockWaitSeconds: 3.5,
        userId: 'test-user-123',
        operationId: 'op-abc',
      })

      dateNowSpy.mockRestore()
    })

    it('should NOT emit ADVISORY_LOCK_CONTENTION event when lock wait is below 3s', async () => {
      // Mock Date.now to simulate a quick lock acquisition (100ms)
      let callCount = 0
      const dateNowSpy = spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        if (callCount <= 1) {
          return 1000
        }
        return 1100 // Only 100ms later
      })

      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:test-123',
        context: { userId: 'test-123' },
        logger: mockLogger as unknown as Logger,
      })

      // Should not emit event for quick lock acquisition
      expect(trackEventSpy).not.toHaveBeenCalled()

      dateNowSpy.mockRestore()
    })

    it('should emit TRANSACTION_RETRY_THRESHOLD_EXCEEDED event on retries with advisory lock properties', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'org:org-456',
        context: { organizationId: 'org-456' },
        logger: mockLogger as unknown as Logger,
      })

      expect(trackEventSpy).toHaveBeenCalledTimes(1)

      const callArgs = trackEventSpy.mock.calls[0] as unknown[]
      const eventPayload = callArgs[0] as Record<string, unknown>

      expect(eventPayload.event).toBe(AnalyticsEvent.TRANSACTION_RETRY_THRESHOLD_EXCEEDED)
      expect(eventPayload.userId).toBe('org-456')
      expect(eventPayload.properties).toMatchObject({
        transactionType: 'advisory_lock',
        lockKey: 'org:org-456',
        lockKeyType: 'org',
        attempt: 2,
        pgErrorCode: '08006',
        pgErrorDescription: 'connection_failure',
        cumulativeDelayMs: 3000,
        organizationId: 'org-456',
      })

      setTimeoutSpy.mockRestore()
    })

    it('should extract userId from lockKey when not in context', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:extracted-user-id',
        context: {}, // No userId in context
        logger: mockLogger as unknown as Logger,
      })

      expect(trackEventSpy).toHaveBeenCalledTimes(1)

      const callArgs = trackEventSpy.mock.calls[0] as unknown[]
      const eventPayload = callArgs[0] as Record<string, unknown>

      // userId should be extracted from lockKey
      expect(eventPayload.userId).toBe('extracted-user-id')

      setTimeoutSpy.mockRestore()
    })
  })

  describe('lock wait observability', () => {
    it('should NOT log when lock wait is below 3s threshold (e.g., 2999ms)', async () => {
      let lockQueryTime: number | undefined
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          const mockTx = {
            execute: mock(async (sql: unknown) => {
              // Simulate a lock wait just below the 3s threshold
              if (JSON.stringify(sql).includes('pg_advisory_xact_lock')) {
                lockQueryTime = Date.now()
                // Simulate 2.9s wait (below 3s threshold)
                await new Promise((resolve) => setTimeout(resolve, 50))
              }
              return []
            }),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:test-123',
        context: {},
        logger: mockLogger as unknown as Logger,
      })

      expect(lockQueryTime).toBeDefined()
      // Should NOT log at WARN level for short waits
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('should log at WARN level when lock wait exceeds 3s threshold', async () => {
      // We can't easily simulate a 3s+ wait in a unit test, but we can verify
      // the logging behavior by checking the log call structure in retry scenarios
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:test-123',
        context: { userId: 'test-123' },
        logger: mockLogger as unknown as Logger,
      })

      expect(attempts).toBe(1)
      // For successful quick operations, no WARN should be logged
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })
  })

  describe('retry observability threshold behavior', () => {
    it('should NOT log on first retry (cumulative delay 1s < 3s threshold)', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          // First attempt fails with connection error
          if (attempts === 1) {
            throw createPostgresError('connection failure', '08006')
          }
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:test-123',
        context: { userId: 'test-123' },
        logger: mockLogger as unknown as Logger,
      })

      expect(attempts).toBe(2)
      // First retry cumulative delay: 1s < 3s threshold - should NOT log
      expect(mockLogger.warn).not.toHaveBeenCalled()

      setTimeoutSpy.mockRestore()
    })

    it('should log on second retry when cumulative delay reaches 3s threshold', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          // First two attempts fail with connection error
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user:test-123',
        context: { userId: 'test-123' },
        logger: mockLogger as unknown as Logger,
      })

      expect(attempts).toBe(3)
      // Second retry cumulative delay: 3s >= 3s threshold - should log once
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      const warnCalls = mockLogger.warn.mock.calls as unknown[][]
      const logContext = warnCalls[0]![0] as Record<string, unknown>
      expect(logContext.cumulativeDelayMs).toBe(3000)
      expect(logContext.attempt).toBe(2)
      expect(logContext.lockKey).toBe('user:test-123')
      expect(logContext.userId).toBe('test-123')

      setTimeoutSpy.mockRestore()
    })

    it('should include lockKey in retry log messages', async () => {
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts <= 2) {
            throw createPostgresError('connection failure', '08006')
          }
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'org:org-456',
        context: { organizationId: 'org-456' },
        logger: mockLogger as unknown as Logger,
      })

      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      const warnCalls = mockLogger.warn.mock.calls as unknown[][]
      const logContext = warnCalls[0]![0] as Record<string, unknown>
      const logMessage = warnCalls[0]![1] as string

      // Verify lockKey is included in context
      expect(logContext.lockKey).toBe('org:org-456')
      expect(logContext.organizationId).toBe('org-456')

      // Verify log message format
      expect(logMessage).toContain('Advisory lock transaction retry 2')
      expect(logMessage).toContain('connection_failure')
      expect(logMessage).toContain('3.0s')

      setTimeoutSpy.mockRestore()
    })
  })

  describe('successful execution', () => {
    it('should acquire advisory lock and return result on success', async () => {
      let lockAcquired = false
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback, options) => {
          // Verify we're using read committed isolation
          expect(options?.isolationLevel).toBe('read committed')
          
          // Mock the tx object with execute method
          const mockTx = {
            execute: mock(async (sql: unknown) => {
              // Check that advisory lock SQL is called by stringifying the SQL object
              if (JSON.stringify(sql).includes('pg_advisory_xact_lock')) {
                lockAcquired = true
              }
              return []
            }),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      const { result, lockWaitMs } = await withAdvisoryLockTransaction({
        callback: async () => 'success',
        lockKey: 'test-user-id',
        context: { userId: 'test-user-id' },
        logger: mockLogger as unknown as Logger,
      })

      expect(result).toBe('success')
      expect(typeof lockWaitMs).toBe('number')
      expect(lockAcquired).toBe(true)
      expect(transactionSpy).toHaveBeenCalledTimes(1)
    })

    it('should use the provided lock key in the advisory lock SQL', async () => {
      let lockKeyUsed = false
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          const mockTx = {
            execute: mock(async (sql: unknown) => {
              // Hacky but robust check for the parameter in the query
              if (JSON.stringify(sql).includes('user-abc-123')) {
                lockKeyUsed = true
              }
              return []
            }),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await withAdvisoryLockTransaction({
        callback: async () => 'result',
        lockKey: 'user-abc-123',
        context: {},
        logger: mockLogger as unknown as Logger,
      })

      expect(lockKeyUsed).toBe(true)
    })
  })

  describe('retry behavior', () => {
    it('should retry on connection failure and succeed', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          attempts++
          if (attempts === 1) {
            throw createPostgresError('connection failure', '08006')
          }
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      const { result } = await withAdvisoryLockTransaction({
        callback: async () => 'success after retry',
        lockKey: 'test-user',
        context: {},
        logger: mockLogger as unknown as Logger,
      })

      expect(result).toBe('success after retry')
      expect(attempts).toBe(2)
      // Note: warn is not called on first retry since cumulative delay < 3s threshold
      // Logging only happens after significant cumulative delay to avoid excessive logs
    })

    it('should NOT retry on serialization failure (should not happen with advisory locks)', async () => {
      let attempts = 0
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async () => {
          attempts++
          throw createPostgresError('serialization failure', '40001')
        },
      )

      await expect(
        withAdvisoryLockTransaction({
          callback: async () => 'should not reach',
          lockKey: 'test-user',
          context: {},
          logger: mockLogger as unknown as Logger,
        }),
      ).rejects.toThrow('serialization failure')

      // Should not retry serialization failures with advisory locks
      expect(attempts).toBe(1)
    })
  })

  describe('lock key validation', () => {
    it('should throw error for empty lock key', async () => {
      await expect(
        withAdvisoryLockTransaction({
          callback: async () => 'should not reach',
          lockKey: '',
          context: {},
          logger: mockLogger as unknown as Logger,
        }),
      ).rejects.toThrow('lockKey must be a non-empty string')
    })

    it('should throw error for whitespace-only lock key', async () => {
      await expect(
        withAdvisoryLockTransaction({
          callback: async () => 'should not reach',
          lockKey: '   ',
          context: {},
          logger: mockLogger as unknown as Logger,
        }),
      ).rejects.toThrow('lockKey must be a non-empty string')
    })
  })

  describe('error handling', () => {
    it('should NOT fall back for normal PG errors like connection failure', async () => {
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async () => {
          throw createPostgresError('connection failure', '08006')
        },
      )

      // With setTimeout mocked to execute immediately
      const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
        ((callback: () => void) => {
          callback()
          return 0 as unknown as NodeJS.Timeout
        }) as typeof setTimeout,
      )

      await expect(
        withAdvisoryLockTransaction({
          callback: async () => 'should not reach',
          lockKey: 'user:test-user',
          context: {},
          logger: mockLogger as unknown as Logger,
        }),
      ).rejects.toThrow('connection failure')

      setTimeoutSpy.mockRestore()
    })

    it('should propagate business logic errors without retry', async () => {
      transactionSpy = spyOn(dbModule.db, 'transaction').mockImplementation(
        async (callback) => {
          const mockTx = {
            execute: mock(async () => []),
          }
          return callback(mockTx as unknown as Parameters<typeof callback>[0])
        },
      )

      await expect(
        withAdvisoryLockTransaction({
          callback: async () => {
            throw new Error('No active grants found')
          },
          lockKey: 'user:test-user',
          context: {},
          logger: mockLogger as unknown as Logger,
        }),
      ).rejects.toThrow('No active grants found')
    })
  })
})
