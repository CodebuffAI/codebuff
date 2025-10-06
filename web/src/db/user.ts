import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'

import type { InferSelectModel } from 'drizzle-orm'

type UserTable = typeof schema.user
type UserColumn = UserTable['_']['columns']
type User = InferSelectModel<UserTable>

export async function getUserInfoFromApiKey<
  T extends readonly (keyof UserColumn)[],
>({
  apiKey,
  fields,
}: {
  apiKey: string
  fields: T
}): Promise<
  | {
      [K in T[number]]: User[K]
    }
  | undefined
> {
  // Build a typed selection object for user columns
  const userSelection = Object.fromEntries(
    fields.map((field) => [field, schema.user[field]])
  ) as { [K in T[number]]: UserColumn[K] }

  const rows = await db
    .select({ user: userSelection }) // <-- important: nest under 'user'
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, apiKey))
    .limit(1)

  // Drizzle returns { user: ..., session: ... }, we return only the user part
  return rows[0]?.user
}
