/**
 * Tests for stripe-metering functions using dependency injection.
 */

import { describe, expect, it } from 'bun:test'

import { reportPurchasedCreditsToStripe } from '../stripe-metering'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { BillingDbConnection } from '@codebuff/common/types/contracts/billing'

// ============================================================================
// Test Helpers
// ============================================================================

const createTestLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

// ============================================================================
// reportPurchasedCreditsToStripe Tests
// ============================================================================

describe('reportPurchasedCreditsToStripe', () => {
  const logger = createTestLogger()

  it('should skip reporting when purchasedCredits is 0', async () => {
    let stripeCalled = false
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            stripeCalled = true
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 0,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(stripeCalled).toBe(false)
  })

  it('should skip reporting when purchasedCredits is negative', async () => {
    let stripeCalled = false
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            stripeCalled = true
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: -100,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(stripeCalled).toBe(false)
  })

  it('should skip reporting when shouldAttemptStripeMetering returns false', async () => {
    let stripeCalled = false
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            stripeCalled = true
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 100,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => false,
      },
    })

    expect(stripeCalled).toBe(false)
  })

  it('should skip reporting when stripeCustomerId is not provided and user has no stripe_customer_id', async () => {
    let stripeCalled = false
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: null }),
        },
      },
    } as unknown as BillingDbConnection

    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            stripeCalled = true
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      purchasedCredits: 100,
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(stripeCalled).toBe(false)
  })

  it('should skip reporting when user is not found', async () => {
    let stripeCalled = false
    const mockDb = {
      query: {
        user: {
          findFirst: async () => null,
        },
      },
    } as unknown as BillingDbConnection

    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            stripeCalled = true
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-not-found',
      purchasedCredits: 100,
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(stripeCalled).toBe(false)
  })

  it('should report to Stripe when stripeCustomerId is provided directly', async () => {
    let capturedPayload: any = null
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async (params: any) => {
            capturedPayload = params
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_direct_123',
      purchasedCredits: 250,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(capturedPayload).not.toBeNull()
    expect(capturedPayload.event_name).toBe('credits')
    expect(capturedPayload.payload.stripe_customer_id).toBe('cus_direct_123')
    expect(capturedPayload.payload.value).toBe('250')
  })

  it('should fetch stripeCustomerId from DB when not provided', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: 'cus_from_db' }),
        },
      },
    } as unknown as BillingDbConnection

    let capturedPayload: any = null
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async (params: any) => {
            capturedPayload = params
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      purchasedCredits: 100,
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(capturedPayload).not.toBeNull()
    expect(capturedPayload.payload.stripe_customer_id).toBe('cus_from_db')
    expect(capturedPayload.payload.value).toBe('100')
  })

  it('should include eventId in payload when provided', async () => {
    let capturedPayload: any = null
    let capturedOptions: any = null
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async (params: any, options: any) => {
            capturedPayload = params
            capturedOptions = options
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 150,
      eventId: 'msg-abc-123',
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(capturedPayload.payload.event_id).toBe('msg-abc-123')
    expect(capturedOptions.idempotencyKey).toBe('meter-msg-abc-123')
  })

  it('should include extraPayload fields when provided', async () => {
    let capturedPayload: any = null
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async (params: any) => {
            capturedPayload = params
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 200,
      extraPayload: {
        model: 'gpt-4',
        context: 'web-search',
      },
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(capturedPayload.payload.model).toBe('gpt-4')
    expect(capturedPayload.payload.context).toBe('web-search')
  })

  it('should use provided timestamp', async () => {
    let capturedPayload: any = null
    const specificTimestamp = new Date('2024-06-15T12:30:00Z')
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async (params: any) => {
            capturedPayload = params
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 100,
      timestamp: specificTimestamp,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    const expectedTimestamp = Math.floor(specificTimestamp.getTime() / 1000)
    expect(capturedPayload.timestamp).toBe(expectedTimestamp)
  })

  it('should handle Stripe API errors gracefully', async () => {
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            throw new Error('Stripe API error')
          },
        },
      },
    }

    // Should not throw - errors are caught and logged
    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 100,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    // If we get here without throwing, the test passes
  })

  it('should handle DB errors gracefully when fetching user', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => {
            throw new Error('Database connection failed')
          },
        },
      },
    } as unknown as BillingDbConnection

    let stripeCalled = false
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async () => {
            stripeCalled = true
            return {}
          },
        },
      },
    }

    // Should not throw - errors are caught and logged
    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      purchasedCredits: 100,
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    // Stripe should not be called since DB lookup failed
    expect(stripeCalled).toBe(false)
  })

  it('should not include idempotencyKey when eventId is not provided', async () => {
    let capturedOptions: any = null
    const mockStripe = {
      billing: {
        meterEvents: {
          create: async (_params: any, options: any) => {
            capturedOptions = options
            return {}
          },
        },
      },
    }

    await reportPurchasedCreditsToStripe({
      userId: 'user-123',
      stripeCustomerId: 'cus_123',
      purchasedCredits: 100,
      logger,
      deps: {
        stripeServer: mockStripe as any,
        shouldAttemptStripeMetering: () => true,
      },
    })

    expect(capturedOptions).toBeUndefined()
  })
})
