/**
 * Tests for balance-calculator functions using dependency injection.
 */

import { describe, expect, it } from 'bun:test'

import {
  consumeCreditsAndAddAgentStep,
  calculateUsageThisCycle,
} from '../balance-calculator'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// ============================================================================
// Test Helpers
// ============================================================================

const createTestLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

const futureDate = (daysFromNow = 30) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)

const pastDate = (daysAgo = 30) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)

// ============================================================================
// calculateUsageThisCycle Tests
// ============================================================================

describe('calculateUsageThisCycle', () => {
  it('should use injected db for queries', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ totalUsed: 500 }]),
        }),
      }),
    }

    const result = await calculateUsageThisCycle({
      userId: 'user-123',
      quotaResetDate: pastDate(30),
      deps: { db: mockDb as any },
    })

    expect(result).toBe(500)
  })

  it('should return 0 when no usage exists', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ totalUsed: 0 }]),
        }),
      }),
    }

    const result = await calculateUsageThisCycle({
      userId: 'user-no-usage',
      quotaResetDate: pastDate(30),
      deps: { db: mockDb as any },
    })

    expect(result).toBe(0)
  })

  it('should calculate usage correctly for high-usage user', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ totalUsed: 50000 }]),
        }),
      }),
    }

    const result = await calculateUsageThisCycle({
      userId: 'user-high-usage',
      quotaResetDate: pastDate(15),
      deps: { db: mockDb as any },
    })

    expect(result).toBe(50000)
  })
})

// ============================================================================
// consumeCreditsAndAddAgentStep Tests
// ============================================================================

describe('consumeCreditsAndAddAgentStep', () => {
  const logger = createTestLogger()

  const baseParams = {
    messageId: 'msg-123',
    userId: 'user-123',
    stripeCustomerId: 'cus_123',
    agentId: 'agent-123',
    clientId: 'client-123',
    clientRequestId: 'req-123',
    startTime: new Date(Date.now() - 1000), // 1 second ago
    model: 'claude-3-opus',
    reasoningText: '',
    response: 'Hello, world!',
    cost: 0.01,
    credits: 10,
    byok: false,
    inputTokens: 100,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: 0,
    reasoningTokens: null,
    outputTokens: 50,
    logger,
  }

  it('should use injected withSerializableTransaction', async () => {
    let transactionCalled = false
    let insertedMessage: any = null

    const mockGrants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-123',
        balance: 1000,
        type: 'free',
        priority: 20,
        expires_at: futureDate(30),
      },
    ]

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      transactionCalled = true
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: (values: any) => {
            insertedMessage = values
            return Promise.resolve()
          },
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async () => {}

    const result = await consumeCreditsAndAddAgentStep({
      ...baseParams,
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(transactionCalled).toBe(true)
    expect(result.success).toBe(true)
    expect(insertedMessage).not.toBeNull()
    expect(insertedMessage.id).toBe('msg-123')
    expect(insertedMessage.user_id).toBe('user-123')
  })

  it('should call trackEvent with correct analytics data', async () => {
    let trackedEvent: any = null

    const mockGrants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-123',
        balance: 1000,
        type: 'purchase',
        priority: 80,
        expires_at: null,
      },
    ]

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(),
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = (params: any) => {
      trackedEvent = params
    }

    const mockReportToStripe = async () => {}

    await consumeCreditsAndAddAgentStep({
      ...baseParams,
      credits: 25,
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(trackedEvent).not.toBeNull()
    expect(trackedEvent.event).toBe('backend.credit_consumed')
    expect(trackedEvent.userId).toBe('user-123')
    expect(trackedEvent.properties.creditsRequested).toBe(25)
    expect(trackedEvent.properties.messageId).toBe('msg-123')
    expect(trackedEvent.properties.model).toBe('claude-3-opus')
    expect(trackedEvent.properties.source).toBe('consumeCreditsAndAddAgentStep')
  })

  it('should call reportPurchasedCreditsToStripe for purchased credits', async () => {
    let stripeReport: any = null

    const mockGrants = [
      {
        operation_id: 'purchase-grant',
        user_id: 'user-123',
        balance: 500,
        type: 'purchase', // This is a purchased grant
        priority: 80,
        expires_at: null,
      },
    ]

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(),
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async (params: any) => {
      stripeReport = params
    }

    await consumeCreditsAndAddAgentStep({
      ...baseParams,
      credits: 100,
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(stripeReport).not.toBeNull()
    expect(stripeReport.userId).toBe('user-123')
    expect(stripeReport.stripeCustomerId).toBe('cus_123')
    expect(stripeReport.purchasedCredits).toBe(100) // All from purchase grant
    expect(stripeReport.extraPayload.source).toBe('consumeCreditsAndAddAgentStep')
    expect(stripeReport.extraPayload.message_id).toBe('msg-123')
  })

  it('should skip credit consumption for BYOK users', async () => {
    let grantsFetched = false
    let insertedMessage: any = null

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => {
                grantsFetched = true
                return Promise.resolve([])
              },
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: (values: any) => {
            insertedMessage = values
            return Promise.resolve()
          },
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async () => {}

    const result = await consumeCreditsAndAddAgentStep({
      ...baseParams,
      byok: true, // User brings their own key
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(result.success).toBe(true)
    expect(grantsFetched).toBe(false) // Should not fetch grants for BYOK
    expect(insertedMessage).not.toBeNull()
    expect(insertedMessage.byok).toBe(true)
  })

  it('should return failure when no active grants exist', async () => {
    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve([]), // No grants
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(),
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async () => {}

    const result = await consumeCreditsAndAddAgentStep({
      ...baseParams,
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeDefined()
    }
  })

  it('should return failure when message insert fails', async () => {
    const mockGrants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-123',
        balance: 1000,
        type: 'free',
        priority: 20,
        expires_at: futureDate(30),
      },
    ]

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: () => {
            throw new Error('Database connection failed')
          },
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async () => {}

    const result = await consumeCreditsAndAddAgentStep({
      ...baseParams,
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeDefined()
    }
  })

  it('should consume from multiple grants when first is insufficient', async () => {
    const updatedGrants: any[] = []

    const mockGrants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-123',
        balance: 30, // Only 30 remaining
        type: 'free',
        priority: 20,
        expires_at: futureDate(10),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-123',
        balance: 500,
        type: 'purchase',
        priority: 80,
        expires_at: null,
      },
    ]

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
        update: () => ({
          set: (values: any) => ({
            where: () => {
              updatedGrants.push(values)
              return Promise.resolve()
            },
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(),
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async () => {}

    const result = await consumeCreditsAndAddAgentStep({
      ...baseParams,
      credits: 50, // Need 50, first grant only has 30
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(result.success).toBe(true)
    // Should update both grants
    expect(updatedGrants.length).toBe(2)
    expect(updatedGrants[0].balance).toBe(0) // First grant depleted
    expect(updatedGrants[1].balance).toBe(480) // 500 - 20
  })

  it('should correctly calculate latency in message record', async () => {
    let insertedMessage: any = null
    const startTime = new Date(Date.now() - 5000) // 5 seconds ago

    const mockGrants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-123',
        balance: 1000,
        type: 'free',
        priority: 20,
        expires_at: futureDate(30),
      },
    ]

    const mockWithSerializableTransaction = async <T>(params: {
      callback: (tx: any) => Promise<T>
      context: Record<string, unknown>
      logger: Logger
    }): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: (values: any) => {
            insertedMessage = values
            return Promise.resolve()
          },
        }),
      }
      return params.callback(tx)
    }

    const mockTrackEvent = () => {}
    const mockReportToStripe = async () => {}

    await consumeCreditsAndAddAgentStep({
      ...baseParams,
      startTime,
      deps: {
        withSerializableTransaction: mockWithSerializableTransaction as any,
        trackEvent: mockTrackEvent as any,
        reportPurchasedCreditsToStripe: mockReportToStripe as any,
      },
    })

    expect(insertedMessage).not.toBeNull()
    // Latency should be approximately 5000ms (within some tolerance)
    expect(insertedMessage.latency_ms).toBeGreaterThan(4900)
    expect(insertedMessage.latency_ms).toBeLessThan(6000)
  })
})
