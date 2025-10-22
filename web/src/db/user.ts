import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'

import type {
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyOutput,
} from '@codebuff/common/types/contracts/database'

export const VALID_USER_INFO_FIELDS = ['id', 'email', 'discord_id'] as const

export async function getUserInfoFromApiKey<
  T extends (typeof VALID_USER_INFO_FIELDS)[number],
>({
  apiKey,
  fields,
}: GetUserInfoFromApiKeyInput<T>): GetUserInfoFromApiKeyOutput<T> {
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
  return rows[0]?.user
}
