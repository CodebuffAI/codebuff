import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/app/api/admin/admin-auth'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: {
    orgId: string
    feature: string
  }
}

// GET handler to fetch feature configuration
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { orgId, feature } = params

  try {
    const featureConfig = await db
      .select()
      .from(schema.orgFeature)
      .where(
        and(
          eq(schema.orgFeature.org_id, orgId),
          eq(schema.orgFeature.feature, feature)
        )
      )
      .limit(1)

    if (featureConfig.length === 0) {
      return NextResponse.json({ config: null }, { status: 404 })
    }

    return NextResponse.json(featureConfig[0])
  } catch (error) {
    console.error('Error fetching feature config:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST handler to create or update feature configuration
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { orgId, feature } = params
  const body = await request.json()

  try {
    const result = await db
      .insert(schema.orgFeature)
      .values({
        org_id: orgId,
        feature: feature,
        config: body,
      })
      .onConflictDoUpdate({
        target: [schema.orgFeature.org_id, schema.orgFeature.feature],
        set: {
          config: body,
          updated_at: new Date(),
        },
      })
      .returning()

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error saving feature config:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
