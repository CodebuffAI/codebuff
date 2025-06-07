import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

// List of admin user emails - single source of truth
export const CODEBUFF_ADMIN_USER_EMAILS = [
  'venkateshrameshkumar+1@gmail.com',
  'brandonchenjiacheng@gmail.com',
  'jahooma@gmail.com',
  'charleslien97@gmail.com',
]

export interface AdminUser {
  id: string
  email: string
  name: string | null
}

export interface AuthResult {
  success: boolean
  error?: {
    type: 'missing-credentials' | 'invalid-token'
    message: string
  }
  user?: {
    id: string
    email: string
    discord_id: string | null
  }
}

/**
 * Check authentication based on auth token and fingerprint ID
 * Returns structured result instead of throwing or logging directly
 */
export async function checkAuthToken({
  fingerprintId,
  authToken,
}: {
  fingerprintId?: string
  authToken?: string
}): Promise<AuthResult> {
  if (!authToken) {
    if (!fingerprintId) {
      return {
        success: false,
        error: {
          type: 'missing-credentials',
          message: 'Auth token and fingerprint ID are missing',
        },
      }
    }
    return { success: true }
  }

  const user = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      discord_id: schema.user.discord_id,
    })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => {
      if (users.length === 1) {
        return users[0]
      }
      return undefined
    })

  if (!user) {
    return {
      success: false,
      error: {
        type: 'invalid-token',
        message: 'Invalid auth token',
      },
    }
  }

  return {
    success: true,
    user,
  }
}

/**
 * Check if a user ID corresponds to a Codebuff admin
 * Returns the admin user if authorized, null if not
 */
export async function checkUserIsCodebuffAdmin(
  userId: string
): Promise<AdminUser | null> {
  // Get the user from the database to verify email
  const user = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .then((users: any) => users[0])

  if (!user?.email || !CODEBUFF_ADMIN_USER_EMAILS.includes(user.email)) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  }
}

/**
 * Check if an email corresponds to a Codebuff admin
 */
export function isCodebuffAdmin(email: string): boolean {
  return CODEBUFF_ADMIN_USER_EMAILS.includes(email)
}

/**
 * Check if the current user session corresponds to a Codebuff admin
 * Returns the admin user if authorized, null if not
 * This is a generic version that can be used with any session object
 */
export async function checkSessionIsAdmin(
  session: { user?: { id?: string } } | null
): Promise<AdminUser | null> {
  if (!session?.user?.id) {
    return null
  }

  return checkUserIsCodebuffAdmin(session.user.id)
}
