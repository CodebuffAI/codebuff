import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { checkUserIsCodebuffAdmin, AdminUser } from '@codebuff/internal/utils'
import { logger } from '@/util/logger'

/**
 * Check if the current user is a Codebuff admin
 * Returns the admin user if authorized, or a NextResponse error if not
 */
export async function checkAdminAuth(): Promise<AdminUser | NextResponse> {
  const session = await getServerSession(authOptions)

  // Use shared admin check utility
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const isAdmin = await checkUserIsCodebuffAdmin(session.user.id)
  if (!isAdmin) {
    if (session?.user?.id) {
      logger.warn(
        { userId: session.user.id },
        'Unauthorized access attempt to admin endpoint'
      )
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return {
    id: session.user.id,
    email: session.user.email || '',
    name: session.user.name || null,
  }
}

/**
 * Higher-order function to wrap admin API routes with authentication
 */
export function withAdminAuth<T extends any[]>(
  handler: (adminUser: AdminUser, ...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const authResult = await checkAdminAuth()

    if (authResult instanceof NextResponse) {
      return authResult // Return the error response
    }

    return handler(authResult, ...args)
  }
}
