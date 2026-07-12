import { evaluateAuditCoverage, inspectCodebaseStructure, inspectFeatureCompleteness } from '../services/audit-intelligence'
import type { CodebuffToolOutput } from '../../../common/src/tools/list'
import type { JSONObject } from '../../../common/src/types/json'

const json = (value: JSONObject): [{ type: 'json'; value: JSONObject }] => [{ type: 'json', value }]

export function inspectCodebaseStructureTool(cwd: string, scope?: string[]): CodebuffToolOutput<'inspect_codebase_structure'> {
  return json(inspectCodebaseStructure(cwd, scope) as unknown as JSONObject)
}

export function inspectFeatureCompletenessTool(cwd: string, input: { feature: string; snapshot_id: string; scope?: string[] }): CodebuffToolOutput<'inspect_feature_completeness'> {
  const inventory = inspectCodebaseStructure(cwd, input.scope)
  if (inventory.snapshotId !== input.snapshot_id) return json({ errorMessage: 'The codebase snapshot is stale. Re-run inspect_codebase_structure.' })
  return json(inspectFeatureCompleteness(cwd, input.feature, inventory) as unknown as JSONObject)
}

export function evaluateAuditCoverageTool(cwd: string, input: { snapshot_id: string; structural_receipts: string[]; features: string[]; out_of_scope?: Array<{ id: string; reason: string }>; scope?: string[] }): CodebuffToolOutput<'evaluate_audit_coverage'> {
  const inventory = inspectCodebaseStructure(cwd, input.scope)
  if (inventory.snapshotId !== input.snapshot_id) return json({ errorMessage: 'The codebase snapshot is stale. Re-run inspect_codebase_structure.' })
  return json(evaluateAuditCoverage({ inventory, structuralReceipts: input.structural_receipts, featureRecords: input.features.map((feature) => inspectFeatureCompleteness(cwd, feature, inventory)), outOfScope: input.out_of_scope }) as unknown as JSONObject)
}
