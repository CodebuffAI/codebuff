import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'

// List of admin user emails - single source of truth
const CODEBUFF_ADMIN_USER_EMAILS = [
  'venkateshrameshkumar+1@gmail.com',
  'brandonchenjiacheng@gmail.com',
  'jahooma@gmail.com',
  'charleslien97@gmail.com',
]

/**
 * Check if an email corresponds to a Codebuff admin
 */
export function isCodebuffAdmin(email: string): boolean {
  return CODEBUFF_ADMIN_USER_EMAILS.includes(email)
}

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
 * Check if the current user session corresponds to a Codebuff admin
 * Returns the admin user if authorized, null if not
 * This is a generic version that can be used with any session object
 */
export async function checkSessionIsAdmin(
  session: { user?: { id?: string } } | null,
): Promise<AdminUser | null> {
  if (!session?.user?.id) {
    return null
  }

  const result = await checkUserIsCodebuffAdmin(session.user.id)
  return result
}

/**
 * Check if a user ID corresponds to a Codebuff admin
 * Returns the admin user if authorized, null if not
 */
export async function checkUserIsCodebuffAdmin(
  userId: string,
): Promise<AdminUser | null> {
  try {
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

    if (!user?.email) {
      return null
    }

    const isAdmin = isCodebuffAdmin(user.email)
    if (!isAdmin) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    }
  } catch (error) {
    console.error('checkUserIsCodebuffAdmin: Database error', error)
    return null
  }
}
