import z from 'zod/v4'
import { jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'
import type { $ToolParams } from '../../constants'

export const inspectCodebaseStructureParams = {
  toolName: 'inspect_codebase_structure',
  endsAgentStep: true,
  description:
    'Builds a snapshot-bound structural inventory of subsystems, entrypoints, routes, commands, public APIs, tests, manifests, and generated files without executing repository scripts.',
  inputSchema: z.object({ scope: z.array(z.string().min(1)).optional() }),
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams

export const inspectFeatureCompletenessParams = {
  toolName: 'inspect_feature_completeness',
  endsAgentStep: true,
  description:
    'Evaluates one claimed feature across entrypoints, implementation, consumers, tests, docs, and failure-state evidence against an exact structural snapshot.',
  inputSchema: z.object({
    feature: z.string().min(1),
    snapshot_id: z.string().min(1),
    scope: z.array(z.string().min(1)).optional(),
  }),
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams

export const evaluateAuditCoverageParams = {
  toolName: 'evaluate_audit_coverage',
  endsAgentStep: true,
  description:
    'Machine-checks structural shard receipts and vertical feature completeness against an exact snapshot; fails completeness when subsystems or feature evidence remain uncovered.',
  inputSchema: z.object({
    snapshot_id: z.string().min(1),
    structural_receipts: z.array(
      z
        .object({
          schema_version: z.literal(1),
          snapshot_id: z.string().min(1),
          shard_id: z.string().min(1),
          subsystem_ids: z.array(z.string().min(1)).min(1),
          files: z.array(z.string().min(1)).min(1),
          domains: z
            .array(
              z.enum([
                'security',
                'correctness',
                'state-mutation',
                'error-handling',
                'performance',
                'dependency-hygiene',
                'test-coverage',
                'api-contract',
              ]),
            )
            .min(1),
        })
        .strict(),
    ),
    features: z
      .array(
        z
          .object({
            schema_version: z.literal(1),
            snapshot_id: z.string().min(1),
            feature: z.string().min(1),
            evidence_kind: z.literal('verified'),
            evidence: z
              .object({
                entrypoints: z.array(z.string()),
                implementation: z.array(z.string()),
                consumers: z.array(z.string()),
                tests: z.array(z.string()),
                docs: z.array(z.string()),
                failure_states: z.array(z.string()),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1),
    out_of_scope: z
      .array(z.object({ id: z.string(), reason: z.string().min(1) }))
      .optional(),
    scope: z.array(z.string().min(1)).optional(),
  }),
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams
