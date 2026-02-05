import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

import { postBillingPortal } from './_post'

export async function POST() {
  return postBillingPortal({
    getSession: () => getServerSession(authOptions),
    createBillingPortalSession: (params) =>
      stripeServer.billingPortal.sessions.create(params),
    logger,
    returnUrl: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/profile`,
  })
}
