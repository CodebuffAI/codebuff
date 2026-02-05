import { NextResponse } from 'next/server'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export type SessionUser = {
  id: string
  stripe_customer_id?: string | null
}

export type Session = {
  user?: SessionUser | null
} | null

export type GetSessionFn = () => Promise<Session>

export type BillingPortalFlowData = {
  type: 'subscription_update'
  subscription_update: {
    subscription: string
  }
}

export type CreateBillingPortalSessionParams = {
  customer: string
  return_url: string
  flow_data?: BillingPortalFlowData
}

export type CreateBillingPortalSessionFn = (
  params: CreateBillingPortalSessionParams
) => Promise<{ url: string }>

export type PostBillingPortalParams = {
  getSession: GetSessionFn
  createBillingPortalSession: CreateBillingPortalSessionFn
  logger: Logger
  returnUrl: string
  flowData?: BillingPortalFlowData
}

export async function postBillingPortal(params: PostBillingPortalParams) {
  const { getSession, createBillingPortalSession, logger, returnUrl, flowData } = params

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripeCustomerId = session.user.stripe_customer_id
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: 'No Stripe customer ID found' },
      { status: 400 }
    )
  }

  try {
    const portalParams: CreateBillingPortalSessionParams = {
      customer: stripeCustomerId,
      return_url: returnUrl,
    }

    if (flowData) {
      portalParams.flow_data = flowData
    }

    const portalSession = await createBillingPortalSession(portalParams)

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    logger.error(
      { userId: session.user.id, error },
      'Failed to create billing portal session'
    )
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
