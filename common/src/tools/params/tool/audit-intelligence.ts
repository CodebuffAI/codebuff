import z from 'zod/v4'
import { jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'
import type { $ToolParams } from '../../constants'

export const auditCoverageDomains = [
  'security',
  'correctness',
  'state-mutation',
  'error-handling',
  'performance',
  'dependency-hygiene',
  'test-coverage',
  'api-contract',
] as const

export const auditCoverageDomainSchema = z.enum(auditCoverageDomains)

function normalizeAuditCoverageInput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const snapshotId = record.snapshot_id ?? record.snapshotId
  const rawStructuralReceipts =
    record.structural_receipts ?? record.structuralReceipts
  const structuralReceipts = Array.isArray(rawStructuralReceipts)
    ? rawStructuralReceipts.map((receipt) => {
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
          return receipt
        }
        const item = receipt as Record<string, unknown>
        return {
          schema_version: item.schema_version ?? item.schemaVersion ?? 1,
          snapshot_id: item.snapshot_id ?? item.snapshotId,
          shard_id: item.shard_id ?? item.shardId,
          subsystem_ids: item.subsystem_ids ?? item.subsystemIds,
          files: item.files,
          domains: Array.isArray(item.domains)
            ? item.domains.map((domain) =>
                domain === 'api-abi' ? 'api-contract' : domain,
              )
            : item.domains,
        }
      })
    : rawStructuralReceipts
  const rawFeatures = record.features ?? record.featureReceipts
  const features = Array.isArray(rawFeatures)
    ? rawFeatures.map((feature) => {
        if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
          return feature
        }
        const item = feature as Record<string, unknown>
        const evidence =
          item.evidence &&
          typeof item.evidence === 'object' &&
          !Array.isArray(item.evidence)
            ? (item.evidence as Record<string, unknown>)
            : {}
        return {
          schema_version: item.schema_version ?? item.schemaVersion ?? 1,
          snapshot_id: item.snapshot_id ?? item.snapshotId,
          feature: item.feature,
          evidence_kind: item.evidence_kind ?? item.evidenceKind,
          evidence: {
            entrypoints: evidence.entrypoints,
            implementation: evidence.implementation,
            consumers: evidence.consumers,
            tests: evidence.tests,
            docs: evidence.docs,
            failure_states: evidence.failure_states ?? evidence.failureStates,
          },
        }
      })
    : rawFeatures
  return {
    ...record,
    snapshot_id: snapshotId,
    structural_receipts: structuralReceipts,
    features,
    out_of_scope: record.out_of_scope ?? record.outOfScope,
  }
}

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
    'Evaluates one claimed feature across entrypoints, implementation, consumers, tests, docs, and failure-state evidence against an exact structural snapshot. Returns coverageReceipt for direct use with evaluate_audit_coverage; it remains heuristic until the cited files are verified with exact reads.',
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
    'Machine-checks structuralReceipt objects from write_audit_findings and coverageReceipt objects from inspect_feature_completeness against an exact snapshot. Every nested receipt must carry its own snapshot id; heuristic feature evidence remains incomplete until explicitly verified.',
  inputSchema: z.preprocess(
    normalizeAuditCoverageInput,
    z.object({
      snapshot_id: z.string().min(1),
      structural_receipts: z.array(
        z
          .object({
            schema_version: z.literal(1),
            snapshot_id: z.string().min(1),
            shard_id: z.string().min(1),
            subsystem_ids: z.array(z.string().min(1)).min(1),
            files: z.array(z.string().min(1)).min(1),
            domains: z.array(auditCoverageDomainSchema).min(1),
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
              evidence_kind: z.enum(['heuristic', 'verified']),
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
  ),
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams
