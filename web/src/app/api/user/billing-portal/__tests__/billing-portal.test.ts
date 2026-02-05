import { describe, expect, mock, test } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'

import { postBillingPortal } from '../_post'

import type { CreateBillingPortalSessionFn, GetSessionFn, Session } from '../_post'

const createMockLogger = (errorFn = mock(() => {})): Logger => ({
  error: errorFn,
  warn: mock(() => {}),
  info: mock(() => {}),
  debug: mock(() => {}),
})

const createMockGetSession = (session: Session): GetSessionFn => mock(() => Promise.resolve(session))

const createMockCreateBillingPortalSession = (
  result: { url: string } | Error = { url: 'https://billing.stripe.com/session/test_123' }
): CreateBillingPortalSessionFn => {
  if (result instanceof Error) {
    return mock(() => Promise.reject(result))
  }
  return mock(() => Promise.resolve(result))
}

describe('/api/user/billing-portal POST endpoint', () => {
  const returnUrl = 'https://codebuff.com/profile'

  describe('Authentication', () => {
    test('returns 401 when session is null', async () => {
      const response = await postBillingPortal({
        getSession: createMockGetSession(null),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })

    test('returns 401 when session.user is null', async () => {
      const response = await postBillingPortal({
        getSession: createMockGetSession({ user: null }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })

    test('returns 401 when session.user.id is missing', async () => {
      const response = await postBillingPortal({
        getSession: createMockGetSession({ user: { stripe_customer_id: 'cus_123' } as any }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })
  })

  describe('Stripe customer validation', () => {
    test('returns 400 when stripe_customer_id is null', async () => {
      const response = await postBillingPortal({
        getSession: createMockGetSession({
          user: { id: 'user-123', stripe_customer_id: null },
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'No Stripe customer ID found' })
    })

    test('returns 400 when stripe_customer_id is undefined', async () => {
      const response = await postBillingPortal({
        getSession: createMockGetSession({
          user: { id: 'user-123' },
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'No Stripe customer ID found' })
    })
  })

  describe('Successful portal session creation', () => {
    test('returns 200 with portal URL on success', async () => {
      const expectedUrl = 'https://billing.stripe.com/session/abc123'
      const response = await postBillingPortal({
        getSession: createMockGetSession({
          user: { id: 'user-123', stripe_customer_id: 'cus_test_123' },
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession({ url: expectedUrl }),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ url: expectedUrl })
    })

    test('calls createBillingPortalSession with correct parameters', async () => {
      const mockCreateSession = createMockCreateBillingPortalSession()
      await postBillingPortal({
        getSession: createMockGetSession({
          user: { id: 'user-123', stripe_customer_id: 'cus_test_456' },
        }),
        createBillingPortalSession: mockCreateSession,
        logger: createMockLogger(),
        returnUrl: 'https://example.com/return',
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith({
        customer: 'cus_test_456',
        return_url: 'https://example.com/return',
      })
    })
  })

  describe('Error handling', () => {
    test('returns 500 when Stripe API throws an error', async () => {
      const response = await postBillingPortal({
        getSession: createMockGetSession({
          user: { id: 'user-123', stripe_customer_id: 'cus_test_123' },
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(
          new Error('Stripe API error')
        ),
        logger: createMockLogger(),
        returnUrl,
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Failed to create billing portal session' })
    })

    test('logs error when Stripe API fails', async () => {
      const mockLoggerError = mock(() => {})
      const testError = new Error('Stripe connection failed')

      await postBillingPortal({
        getSession: createMockGetSession({
          user: { id: 'user-123', stripe_customer_id: 'cus_test_123' },
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(testError),
        logger: createMockLogger(mockLoggerError),
        returnUrl,
      })

      expect(mockLoggerError).toHaveBeenCalledTimes(1)
      expect(mockLoggerError).toHaveBeenCalledWith(
        { userId: 'user-123', error: testError },
        'Failed to create billing portal session'
      )
    })
  })
})
