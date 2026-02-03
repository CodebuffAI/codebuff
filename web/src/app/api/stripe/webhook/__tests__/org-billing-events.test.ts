import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

import type Stripe from 'stripe'

import { ORG_BILLING_ENABLED } from '@/lib/billing-config'

// Mock database query result
let mockDbSelectResult: { id: string }[] = []

let isOrgBillingEvent: (event: Stripe.Event) => Promise<boolean>
let isOrgCustomer: (stripeCustomerId: string) => Promise<boolean>

const setupMocks = async () => {
  const limitMock = mock(() => Promise.resolve(mockDbSelectResult))
  const whereMock = mock(() => ({ limit: limitMock }))
  const fromMock = mock(() => ({ where: whereMock }))
  const selectMock = mock(() => ({ from: fromMock }))

  await mockModule('@codebuff/internal/db', () => ({
    default: {
      select: selectMock,
    },
  }))

  await mockModule('@codebuff/internal/db/schema', () => ({
    org: {
      id: 'id',
      stripe_customer_id: 'stripe_customer_id',
    },
  }))

  await mockModule('drizzle-orm', () => ({
    eq: mock((a: unknown, b: unknown) => ({ column: a, value: b })),
  }))

  // Import after mocking
  const webhookModule = await import('../route')
  isOrgBillingEvent = webhookModule.isOrgBillingEvent
  isOrgCustomer = webhookModule.isOrgCustomer
}

// Setup mocks at module load time (following ban-conditions.test.ts pattern)
await setupMocks()

beforeEach(() => {
  mockDbSelectResult = []
})

afterAll(() => {
  clearMockedModules()
})

describe('ORG_BILLING_ENABLED feature flag', () => {
  test('is currently false (org billing disabled)', () => {
    // This test ensures the feature flag is in the expected state
    // for the isOrgBillingEvent tests to be meaningful
    expect(ORG_BILLING_ENABLED).toBe(false)
  })
})

describe('isOrgCustomer', () => {
  test('returns true when customer ID belongs to an organization', async () => {
    mockDbSelectResult = [{ id: 'org-123' }]

    const result = await isOrgCustomer('cus_org_123')

    expect(result).toBe(true)
  })

  test('returns false when customer ID does not belong to any organization', async () => {
    mockDbSelectResult = []

    const result = await isOrgCustomer('cus_user_123')

    expect(result).toBe(false)
  })
})

describe('isOrgBillingEvent', () => {
  const createMockEvent = (
    type: string,
    data: Record<string, unknown>,
  ): Stripe.Event => ({
    id: 'evt_test',
    type,
    data: { object: data },
    api_version: '2023-10-16',
    created: Date.now(),
    livemode: false,
    object: 'event',
    pending_webhooks: 0,
    request: null,
  }) as unknown as Stripe.Event

  describe('metadata-based detection', () => {
    test('returns true when metadata contains organization_id', async () => {
      const event = createMockEvent('checkout.session.completed', {
        metadata: { organization_id: 'org-123' },
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })

    test('returns true when metadata contains organizationId', async () => {
      const event = createMockEvent('invoice.paid', {
        metadata: { organizationId: 'org-123' },
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })

    test('returns true when metadata.grantType is organization_purchase', async () => {
      const event = createMockEvent('checkout.session.completed', {
        metadata: { grantType: 'organization_purchase', organizationId: 'org-123' },
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })

    test('returns false when metadata has no org markers', async () => {
      const event = createMockEvent('checkout.session.completed', {
        metadata: { userId: 'user-123', grantType: 'purchase' },
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })
  })

  describe('invoice events', () => {
    test('returns true for invoice event with organizationId in metadata', async () => {
      const event = createMockEvent('invoice.paid', {
        metadata: { organizationId: 'org-123', type: 'auto-topup' },
        customer: 'cus_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })

    test('returns true for invoice event when customer belongs to an org', async () => {
      mockDbSelectResult = [{ id: 'org-123' }]

      const event = createMockEvent('invoice.payment_failed', {
        metadata: {},
        customer: 'cus_org_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })

    test('returns false for invoice event when customer is not an org', async () => {
      mockDbSelectResult = []

      const event = createMockEvent('invoice.paid', {
        metadata: {},
        customer: 'cus_user_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('handles invoice.created event', async () => {
      mockDbSelectResult = [{ id: 'org-456' }]

      const event = createMockEvent('invoice.created', {
        metadata: {},
        customer: 'cus_org_456',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })
  })

  describe('subscription events', () => {
    test('returns true for subscription event when customer belongs to an org', async () => {
      mockDbSelectResult = [{ id: 'org-123' }]

      const event = createMockEvent('customer.subscription.created', {
        metadata: {},
        customer: 'cus_org_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })

    test('returns false for subscription event when customer is not an org', async () => {
      mockDbSelectResult = []

      const event = createMockEvent('customer.subscription.updated', {
        metadata: {},
        customer: 'cus_user_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('handles customer.subscription.deleted event', async () => {
      mockDbSelectResult = [{ id: 'org-789' }]

      const event = createMockEvent('customer.subscription.deleted', {
        metadata: {},
        customer: 'cus_org_789',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(true)
    })
  })

  describe('personal billing events (should return false)', () => {
    test('returns false for user credit purchase', async () => {
      const event = createMockEvent('checkout.session.completed', {
        metadata: {
          grantType: 'purchase',
          userId: 'user-123',
          credits: '1000',
        },
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('returns false for user subscription event', async () => {
      mockDbSelectResult = []

      const event = createMockEvent('customer.subscription.created', {
        metadata: {},
        customer: 'cus_user_only',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('returns false for charge.dispute.created (no org markers)', async () => {
      const event = createMockEvent('charge.dispute.created', {
        metadata: {},
        charge: 'ch_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('returns false for charge.refunded (no org markers)', async () => {
      const event = createMockEvent('charge.refunded', {
        metadata: {},
        payment_intent: 'pi_123',
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('handles missing metadata gracefully', async () => {
      const event = createMockEvent('checkout.session.completed', {})

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('handles null customer ID', async () => {
      const event = createMockEvent('invoice.paid', {
        metadata: {},
        customer: null,
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('handles non-string customer ID', async () => {
      const event = createMockEvent('customer.subscription.updated', {
        metadata: {},
        customer: { id: 'cus_123' }, // Object instead of string
      })

      const result = await isOrgBillingEvent(event)

      expect(result).toBe(false)
    })

    test('prioritizes metadata check over customer lookup', async () => {
      // Even if customer lookup would return true, metadata check happens first
      mockDbSelectResult = [{ id: 'org-123' }]

      const event = createMockEvent('checkout.session.completed', {
        metadata: { organization_id: 'org-456' },
        customer: 'cus_org_123',
      })

      const result = await isOrgBillingEvent(event)

      // Should return true from metadata check (before customer lookup)
      expect(result).toBe(true)
    })
  })
})
