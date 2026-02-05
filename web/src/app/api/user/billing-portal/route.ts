import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { getServerSession } from 'next-auth'

import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

import { postBillingPortal } from './_post'

import type { BillingPortalFlowData } from './_post'

export async function POST(req: NextRequest) {
  // Parse optional subscriptionId from request body for deep-linking to subscription update
  let flowData: BillingPortalFlowData | undefined
  const body = await req.json().catch(() => null)
  if (body?.subscriptionId) {
    flowData = {
      type: 'subscription_update',
      subscription_update: {
        subscription: body.subscriptionId,
      },
    }
  }

  // Determine return URL - use provided returnUrl or default to /pricing
  const returnUrl = body?.returnUrl || `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing`

  return postBillingPortal({
    getSession: () => getServerSession(authOptions),
    createBillingPortalSession: (params) =>
      stripeServer.billingPortal.sessions.create(params),
    logger,
    returnUrl,
    flowData,
  })
}
