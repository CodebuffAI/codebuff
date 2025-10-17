import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and } from 'drizzle-orm'

import type {
  AgentRunColumn,
  GetAgentRunFromIdInput,
  GetAgentRunFromIdOutput,
} from '@codebuff/common/types/contracts/database'

export async function getAgentRunFromId<T extends AgentRunColumn>(
  params: GetAgentRunFromIdInput<T>,
): GetAgentRunFromIdOutput<T> {
  const { agentRunId, userId, fields } = params

  const selection = Object.fromEntries(
    fields.map((field) => [field, schema.agentRun[field]]),
  ) as { [K in T]: (typeof schema.agentRun)[K] }

  const rows = await db
    .select({ selection })
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.id, agentRunId),
        eq(schema.agentRun.user_id, userId),
      ),
    )
    .limit(1)

  return rows[0]?.selection ?? null
}
