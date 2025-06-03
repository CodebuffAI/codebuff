import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { getOrganizationUsageData } from '@codebuff/billing'

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

    // Use the new consolidated usage service
    const response = await getOrganizationUsageData(orgId, session.user.id)

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching organization usage:', error)
    
    // Handle specific error cases
    if (error instanceof Error && error.message === 'User is not a member of this organization') {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}