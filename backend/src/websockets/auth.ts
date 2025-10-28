import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'

import type {
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyOutput,
  UserColumn,
} from '@codebuff/common/types/contracts/database'

export async function getUserInfoFromApiKey<T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
): GetUserInfoFromApiKeyOutput<T> {
  const { apiKey, fields } = params

  // Build a typed selection object for user columns
  const userSelection = Object.fromEntries(
    fields.map((field) => [field, schema.user[field]]),
  ) as { [K in T]: (typeof schema.user)[K] }

  const rows = await db
    .select({ user: userSelection }) // <-- important: nest under 'user'
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, apiKey))
    .limit(1)

  // Drizzle returns { user: ..., session: ... }, we return only the user part
  return rows[0]?.user ?? null
}
