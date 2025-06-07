import db from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { logger } from '../../../common/src/util/logger'

export const CODEBUFF_ADMIN_USER_EMAILS = [
  'brandon@codebuff.com',
  'james@codebuff.com',
]

export interface AdminUser {
  id: string
  email: string
  name: string | null
}

export interface AuthResult {
  success: boolean
  user?: AdminUser
  error?: string
}

export async function checkAuthToken(token: string): Promise<AuthResult> {
  try {
    const session = await db
      .select({
        sessionToken: schema.session.sessionToken,
        expires: schema.session.expires,
        userId: schema.session.userId,
        userEmail: schema.user.email,
        userName: schema.user.name,
      })
      .from(schema.session)
      .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
      .where(eq(schema.session.sessionToken, token))
      .limit(1)

    if (session.length === 0 || session[0].expires < new Date()) {
      return { success: false, error: 'Invalid or expired session' }
    }

    const sessionData = session[0]
    return {
      success: true,
      user: {
        id: sessionData.userId,
        email: sessionData.userEmail,
        name: sessionData.userName,
      },
    }
  } catch (error) {
    logger.error({ error }, 'Error checking auth token')
    return { success: false, error: 'Authentication error' }
  }
}

export async function checkUserIsCodebuffAdmin(userId: string): Promise<boolean> {
  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { email: true },
    })

    return user ? CODEBUFF_ADMIN_USER_EMAILS.includes(user.email) : false
  } catch (error) {
    logger.error({ userId, error }, 'Error checking admin status')
    return false
  }
}

export function isCodebuffAdmin(email: string): boolean {
  return CODEBUFF_ADMIN_USER_EMAILS.includes(email)
}

export async function checkSessionIsAdmin(sessionToken: string): Promise<boolean> {
  try {
    const authResult = await checkAuthToken(sessionToken)
    if (!authResult.success || !authResult.user) {
      return false
    }

    return isCodebuffAdmin(authResult.user.email)
  } catch (error) {
    logger.error({ error }, 'Error checking session admin status')
    return false
  }
}
