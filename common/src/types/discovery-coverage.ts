import { z } from 'zod/v4'

export const discoveryCoverageV1Schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  workspaceRevision: z.number().int().nonnegative().optional(),
  queryHash: z.string().min(1),
  indexSnapshotId: z.string().optional(),
  candidates: z.array(
    z.object({
      path: z.string().min(1),
      symbols: z.array(z.string()),
      reasons: z.array(z.string()),
      verified: z.boolean(),
      stale: z.boolean(),
      workspaceRevision: z.number().int().nonnegative().optional(),
    }),
  ),
  shards: z.array(
    z.object({
      key: z.string().min(1),
      agentType: z.string().min(1),
      question: z.string().min(1),
      status: z.enum(['active', 'completed', 'failed', 'interrupted']),
      assignedAt: z.number().int().nonnegative(),
      completedAt: z.number().int().nonnegative().optional(),
    }),
  ),
  coveredDomains: z.array(z.string()),
  unresolvedGaps: z.array(z.string()),
})

export type DiscoveryCoverageV1 = z.infer<typeof discoveryCoverageV1Schema>
