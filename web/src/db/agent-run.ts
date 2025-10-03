import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and } from 'drizzle-orm'

import type { InferSelectModel } from 'drizzle-orm'

type AgentRunTable = typeof schema.agentRun
type AgentRunColumn = AgentRunTable['_']['columns']
type AgentRun = InferSelectModel<AgentRunTable>

export async function getAgentRunFromId<
  T extends readonly (keyof AgentRunColumn)[],
>({
  agentRunId,
  userId,
  fields,
}: {
  agentRunId: string
  userId: string
  fields: T
}): Promise<
  | {
      [K in T[number]]: AgentRun[K]
    }
  | undefined
> {
  const selection = Object.fromEntries(
    fields.map((field) => [field, schema.agentRun[field]])
  ) as { [K in T[number]]: AgentRunColumn[K] }

  const rows = await db
    .select({ selection })
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.id, agentRunId),
        eq(schema.agentRun.user_id, userId)
      )
    )
    .limit(1)

  return rows[0]?.selection
}
