import { db } from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { utils } from '@codebuff/internal'
import { desc, eq } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { z } from 'zod/v4'

import { EvalsTable } from './evals-table'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'

const GitEvalMetadataSchema = z
  .object({
    numCases: z.number().optional(),
    avgScore: z.number().optional(),
    avgCompletion: z.number().optional(),
    avgEfficiency: z.number().optional(),
    avgCodeQuality: z.number().optional(),
    avgDuration: z.number().optional(),
    suite: z.string().optional(),
    avgTurns: z.number().optional(),
  })
  .nullable()

const GitEvalResultSchema = z.object({
  id: z.string(),
  cost_mode: z.string().nullable(),
  reasoner_model: z.string().nullable(),
  agent_model: z.string().nullable(),
  metadata: GitEvalMetadataSchema,
  cost: z.number(),
  is_public: z.boolean(),
  created_at: z.date(),
})

type GitEvalResult = typeof schema.gitEvalResults.$inferSelect & {
  metadata: schema.GitEvalMetadata | null
}

async function getEvalResults(): Promise<{
  results: GitEvalResult[]
  isAdmin: boolean
}> {
  const limit = 100

  // Check if user is admin
  const session = await getServerSession(authOptions)
  const isAdmin = await utils.checkSessionIsAdmin(session)

  // Build query with conditional where clause
  const evalResults = await db
    .select()
    .from(schema.gitEvalResults)
    .where(isAdmin ? undefined : eq(schema.gitEvalResults.is_public, true))
    .orderBy(desc(schema.gitEvalResults.id))
    .limit(limit)

  // Validate results with Zod before casting
  const validatedResults = z.array(GitEvalResultSchema).parse(evalResults)

  return {
    results: validatedResults as GitEvalResult[],
    isAdmin: !!isAdmin,
  }
}

export default async function Evals() {
  const { results, isAdmin } = await getEvalResults()

  return <EvalsTable results={results} isAdmin={isAdmin} />
}
