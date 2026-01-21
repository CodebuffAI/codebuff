import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { createPostgresError } from '@codebuff/common/testing/errors'

import {
  getRetryableErrorDescription,
  isRetryablePostgresError,
} from '../transaction'
import * as dbModule from '../index'

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

describe('withSerializableTransaction', () => {
  // We need to dynamically import the function to allow mocking
  let withSerializableTransaction: typeof import('../transaction').withSerializableTransaction
  let mockLogger: {
    warn: ReturnType<typeof mock>
    error: ReturnType<typeof mock>
    info: ReturnType<typeof mock>
    debug: ReturnType<typeof mock>
  }
  let transactionSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    // Create a fresh mock logger for each test
    mockLogger = {
      warn: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    // Re-import to get fresh module
    const transactionModule = await import('../transaction')
    withSerializableTransaction = transactionModule.withSerializableTransaction
  })

  afterEach(() => {
    mock.restore()
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
      expect(mockLogger.warn).toHaveBeenCalled()
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

    it('should log warning with error details on retry', async () => {
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

      await withSerializableTransaction({
        callback: async () => 'result',
        context: { userId: 'user-123', operationId: 'op-456' },
        logger: mockLogger as unknown as Parameters<typeof withSerializableTransaction>[0]['logger'],
      })

      // Verify logging was called with proper context
      expect(mockLogger.warn).toHaveBeenCalled()
      const warnCalls = mockLogger.warn.mock.calls
      expect(warnCalls.length).toBeGreaterThan(0)

      // Check that context is passed in the log
      const firstCallArgs = warnCalls[0]
      expect(firstCallArgs[0]).toMatchObject({
        userId: 'user-123',
        operationId: 'op-456',
        pgErrorCode: '40001',
      })
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
