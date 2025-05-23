import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { findOrganizationForRepository } from 'common/src/credit-delegation'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { repositoryUrl } = await request.json()

    if (!repositoryUrl) {
      return NextResponse.json({ 
        error: 'Repository URL is required' 
      }, { status: 400 })
    }

    // Use existing credit delegation logic
    const orgLookup = await findOrganizationForRepository(
      session.user.id,
      repositoryUrl
    )

    if (orgLookup.found) {
      return NextResponse.json({
        organization: {
          id: orgLookup.organizationId,
          name: orgLookup.organizationName
        }
      })
    }

    return NextResponse.json({ organization: null })
  } catch (error) {
    console.error('Error checking repository organization:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
