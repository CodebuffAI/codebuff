import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { getOrganizationAlerts } from '@codebuff/billing'
import { OrganizationAlert } from 'common/src/types/organization'; // Import the type

interface RouteParams {
  params: { orgId: string }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    // Consider replacing this with checkOrganizationPermission for consistency and robustness
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get alerts using centralized billing logic
    const alerts: OrganizationAlert[] = await getOrganizationAlerts(orgId) // Type the result

    // Convert Date objects to ISO strings for JSON serialization
    const serializedAlerts = alerts.map((alert: OrganizationAlert) => ({ // Explicitly type 'alert' parameter
      ...alert,
      // Ensure timestamp exists before calling toISOString, or handle potential undefined
      timestamp: alert.timestamp ? alert.timestamp.toISOString() : new Date(0).toISOString(), // Fallback for safety
    }));

    return NextResponse.json({ alerts: serializedAlerts })
  } catch (error) {
    console.error('Error fetching billing alerts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
