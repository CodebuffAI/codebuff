import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from 'next-auth'

import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { ORG_BILLING_ENABLED } from '@/lib/billing-config'
import { logger } from '@/util/logger'

import { postOrgBillingPortal } from './_post'

import type { GetMembershipFn } from './_post'

interface RouteParams {
  params: Promise<{
    orgId: string
  }>
}

const getMembership: GetMembershipFn = async ({ orgId, userId }) => {
  const membership = await db
    .select({
      role: schema.orgMember.role,
      organization: schema.org,
    })
    .from(schema.orgMember)
    .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
    .where(
      and(
        eq(schema.orgMember.org_id, orgId),
        eq(schema.orgMember.user_id, userId),
      ),
    )
    .limit(1)

  if (membership.length === 0) {
    return null
  }

  return membership[0]
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params

  return postOrgBillingPortal({
    orgId,
    getSession: () => getServerSession(authOptions),
    getMembership,
    createBillingPortalSession: (params) =>
      stripeServer.billingPortal.sessions.create(params),
    logger,
    orgBillingEnabled: ORG_BILLING_ENABLED,
    buildReturnUrl: (orgSlug) =>
      `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/orgs/${orgSlug}/settings`,
  })
}
