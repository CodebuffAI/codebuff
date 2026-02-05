import { NextResponse } from 'next/server'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export type OrgMemberRole = 'owner' | 'admin' | 'member'

export type Organization = {
  id: string
  name: string
  slug: string
  stripe_customer_id: string | null
}

export type OrgMembership = {
  role: OrgMemberRole
  organization: Organization
}

export type SessionUser = {
  id: string
}

export type Session = {
  user?: SessionUser | null
} | null

export type GetSessionFn = () => Promise<Session>

export type GetMembershipFn = (params: {
  orgId: string
  userId: string
}) => Promise<OrgMembership | null>

export type CreateBillingPortalSessionFn = (params: {
  customer: string
  return_url: string
}) => Promise<{ url: string }>

export type PostOrgBillingPortalParams = {
  orgId: string
  getSession: GetSessionFn
  getMembership: GetMembershipFn
  createBillingPortalSession: CreateBillingPortalSessionFn
  logger: Logger
  orgBillingEnabled: boolean
  buildReturnUrl: (orgSlug: string) => string
}

export async function postOrgBillingPortal(params: PostOrgBillingPortalParams) {
  const {
    orgId,
    getSession,
    getMembership,
    createBillingPortalSession,
    logger,
    orgBillingEnabled,
    buildReturnUrl,
  } = params

  if (!orgBillingEnabled) {
    return NextResponse.json(
      { error: 'Organization billing is temporarily disabled' },
      { status: 503 }
    )
  }

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const membership = await getMembership({ orgId, userId })

  if (!membership) {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 404 }
    )
  }

  const { role, organization } = membership

  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    )
  }

  if (!organization.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer ID found for organization' },
      { status: 400 }
    )
  }

  try {
    const portalSession = await createBillingPortalSession({
      customer: organization.stripe_customer_id,
      return_url: buildReturnUrl(organization.slug),
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    logger.error(
      { userId, orgId, error },
      'Failed to create org billing portal session'
    )
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
