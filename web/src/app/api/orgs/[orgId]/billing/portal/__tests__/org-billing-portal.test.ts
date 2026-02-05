import { describe, expect, mock, test } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'

import { postOrgBillingPortal } from '../_post'

import type {
  CreateBillingPortalSessionFn,
  GetMembershipFn,
  GetSessionFn,
  OrgMembership,
  Session,
} from '../_post'

const createMockLogger = (errorFn = mock(() => {})): Logger => ({
  error: errorFn,
  warn: mock(() => {}),
  info: mock(() => {}),
  debug: mock(() => {}),
})

const createMockGetSession = (session: Session): GetSessionFn =>
  mock(() => Promise.resolve(session))

const createMockGetMembership = (
  result: OrgMembership | null
): GetMembershipFn => mock(() => Promise.resolve(result))

const createMockCreateBillingPortalSession = (
  result: { url: string } | Error = { url: 'https://billing.stripe.com/session/test_123' }
): CreateBillingPortalSessionFn => {
  if (result instanceof Error) {
    return mock(() => Promise.reject(result))
  }
  return mock(() => Promise.resolve(result))
}

const defaultOrg = {
  id: 'org-123',
  name: 'Test Org',
  slug: 'test-org',
  stripe_customer_id: 'cus_org_123',
}

const buildReturnUrl = (orgSlug: string) => `https://codebuff.com/orgs/${orgSlug}/settings`

describe('/api/orgs/[orgId]/billing/portal POST endpoint', () => {
  const orgId = 'org-123'

  describe('Feature flag', () => {
    test('returns 503 when org billing is disabled', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'owner',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: false,
        buildReturnUrl,
      })

      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body).toEqual({ error: 'Organization billing is temporarily disabled' })
    })
  })

  describe('Authentication', () => {
    test('returns 401 when session is null', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession(null),
        getMembership: createMockGetMembership(null),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })

    test('returns 401 when session.user is null', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: null }),
        getMembership: createMockGetMembership(null),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })

    test('returns 401 when session.user.id is missing', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: {} as any }),
        getMembership: createMockGetMembership(null),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Unauthorized' })
    })
  })

  describe('Organization membership', () => {
    test('returns 404 when user is not a member of the organization', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership(null),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toEqual({ error: 'Organization not found' })
    })

    test('calls getMembership with correct parameters', async () => {
      const mockGetMembership = createMockGetMembership({
        role: 'owner',
        organization: defaultOrg,
      })

      await postOrgBillingPortal({
        orgId: 'org-456',
        getSession: createMockGetSession({ user: { id: 'user-789' } }),
        getMembership: mockGetMembership,
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(mockGetMembership).toHaveBeenCalledTimes(1)
      expect(mockGetMembership).toHaveBeenCalledWith({
        orgId: 'org-456',
        userId: 'user-789',
      })
    })
  })

  describe('Permissions', () => {
    test('returns 403 when user is a member (not owner or admin)', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'member',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body).toEqual({ error: 'Insufficient permissions' })
    })

    test('allows owner to access billing portal', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'owner',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(200)
    })

    test('allows admin to access billing portal', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'admin',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(200)
    })
  })

  describe('Stripe customer validation', () => {
    test('returns 400 when organization has no stripe_customer_id', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'owner',
          organization: { ...defaultOrg, stripe_customer_id: null },
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'No Stripe customer ID found for organization' })
    })
  })

  describe('Successful portal session creation', () => {
    test('returns 200 with portal URL on success', async () => {
      const expectedUrl = 'https://billing.stripe.com/session/org_abc123'
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'owner',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession({ url: expectedUrl }),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ url: expectedUrl })
    })

    test('calls createBillingPortalSession with correct parameters', async () => {
      const mockCreateSession = createMockCreateBillingPortalSession()

      await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'admin',
          organization: {
            ...defaultOrg,
            slug: 'my-org',
            stripe_customer_id: 'cus_my_org_456',
          },
        }),
        createBillingPortalSession: mockCreateSession,
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl: (slug) => `https://example.com/orgs/${slug}/billing`,
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockCreateSession).toHaveBeenCalledWith({
        customer: 'cus_my_org_456',
        return_url: 'https://example.com/orgs/my-org/billing',
      })
    })
  })

  describe('Error handling', () => {
    test('returns 500 when Stripe API throws an error', async () => {
      const response = await postOrgBillingPortal({
        orgId,
        getSession: createMockGetSession({ user: { id: 'user-123' } }),
        getMembership: createMockGetMembership({
          role: 'owner',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(
          new Error('Stripe API error')
        ),
        logger: createMockLogger(),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Failed to create billing portal session' })
    })

    test('logs error when Stripe API fails', async () => {
      const mockLoggerError = mock(() => {})
      const testError = new Error('Stripe connection failed')

      await postOrgBillingPortal({
        orgId: 'org-error-test',
        getSession: createMockGetSession({ user: { id: 'user-error' } }),
        getMembership: createMockGetMembership({
          role: 'owner',
          organization: defaultOrg,
        }),
        createBillingPortalSession: createMockCreateBillingPortalSession(testError),
        logger: createMockLogger(mockLoggerError),
        orgBillingEnabled: true,
        buildReturnUrl,
      })

      expect(mockLoggerError).toHaveBeenCalledTimes(1)
      expect(mockLoggerError).toHaveBeenCalledWith(
        { userId: 'user-error', orgId: 'org-error-test', error: testError },
        'Failed to create org billing portal session'
      )
    })
  })
})
