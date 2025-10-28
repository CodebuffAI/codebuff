import { db } from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq } from 'drizzle-orm'

export async function fetchAgent(
  agentId: string,
  version: string,
  publisher: string,
) {
  // Find the agent template
  const agent = await db
    .select()
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.id, agentId),
        eq(schema.agentConfig.version, version),
        eq(schema.agentConfig.publisher_id, publisher),
      ),
    )
    .then((rows) => rows[0])

  return agent
}
