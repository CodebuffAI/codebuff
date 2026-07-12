import z from 'zod/v4'
import { jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'
import type { $ToolParams } from '../../constants'

export const inspectCodebaseStructureParams = {
  toolName: 'inspect_codebase_structure', endsAgentStep: true,
  description: 'Builds a snapshot-bound structural inventory of subsystems, entrypoints, routes, commands, public APIs, tests, manifests, and generated files without executing repository scripts.',
  inputSchema: z.object({ scope: z.array(z.string().min(1)).optional() }), outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams

export const inspectFeatureCompletenessParams = {
  toolName: 'inspect_feature_completeness', endsAgentStep: true,
  description: 'Evaluates one claimed feature across entrypoints, implementation, consumers, tests, docs, and failure-state evidence against an exact structural snapshot.',
  inputSchema: z.object({ feature: z.string().min(1), snapshot_id: z.string().min(1), scope: z.array(z.string().min(1)).optional() }), outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams

export const evaluateAuditCoverageParams = {
  toolName: 'evaluate_audit_coverage', endsAgentStep: true,
  description: 'Machine-checks structural shard receipts and vertical feature completeness against an exact snapshot; fails completeness when subsystems or feature evidence remain uncovered.',
  inputSchema: z.object({ snapshot_id: z.string().min(1), structural_receipts: z.array(z.string()), features: z.array(z.string()), out_of_scope: z.array(z.object({ id: z.string(), reason: z.string().min(1) })).optional(), scope: z.array(z.string().min(1)).optional() }), outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams
