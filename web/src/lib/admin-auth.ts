import { utils } from '@codebuff/internal'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

/**
 * Check if the current user is a Codebuff admin
 * Returns the admin user if authorized, or a NextResponse error if not
 */
export async function checkAdminAuth(): Promise<
  utils.AdminUser | NextResponse
> {
  const session = await getServerSession(authOptions)

  // Use shared admin check utility
  const adminUser = await utils.checkSessionIsAdmin(session)
  if (!adminUser) {
    if (session?.user?.id) {
      logger.warn(
        { userId: session.user.id },
        'Unauthorized access attempt to admin endpoint',
      )
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return adminUser
}

/**
 * Higher-order function to wrap admin API routes with authentication
 */
export function withAdminAuth<T extends any[]>(
  handler: (adminUser: utils.AdminUser, ...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    const authResult = await checkAdminAuth()

    if (authResult instanceof NextResponse) {
      return authResult // Return the error response
    }

    return handler(authResult, ...args)
  }
}
