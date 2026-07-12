import { describe, expect, test } from 'bun:test'

import { handleGetAffectedTests } from '../get-affected-tests'
import { handleGetBuildTargets } from '../get-build-targets'
import { handleEvaluateAuditCoverage, handleInspectCodebaseStructure, handleInspectFeatureCompleteness } from '../audit-intelligence'
import { handleInspectEnvironment } from '../inspect-environment'

describe('harness intelligence proxy handlers', () => {
  test('forward only their narrow read inputs', async () => {
    const seen: unknown[] = []
    const requestClientToolCall = async (call: unknown) => {
      seen.push(call)
      return [{ type: 'json', value: { targets: [] } }] as never
    }
    await handleInspectEnvironment({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { toolName: 'inspect_environment', toolCallId: 'env', input: {} },
      requestClientToolCall: async (call: unknown) => {
        seen.push(call)
        return [{ type: 'json', value: {} }] as never
      },
    } as never)
    await handleGetAffectedTests({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { toolName: 'get_affected_tests', toolCallId: 'tests', input: { files: ['a.ts'] } },
      requestClientToolCall,
    } as never)
    await handleGetBuildTargets({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { toolName: 'get_build_targets', toolCallId: 'build', input: { files: ['a.ts'] } },
      requestClientToolCall,
    } as never)
    expect(seen).toEqual([
      { toolName: 'inspect_environment', toolCallId: 'env', input: {} },
      { toolName: 'get_affected_tests', toolCallId: 'tests', input: { files: ['a.ts'] } },
      { toolName: 'get_build_targets', toolCallId: 'build', input: { files: ['a.ts'] } },
    ])
  })

  test('forwards native audit inventory and coverage inputs unchanged', async () => {
    const calls: unknown[] = []
    const requestClientToolCall = async (call: unknown) => { calls.push(call); return [{ type: 'json' as const, value: {} }] }
    await handleInspectCodebaseStructure({ previousToolCallFinished: Promise.resolve(), toolCall: { toolName: 'inspect_codebase_structure', toolCallId: 'structure', input: { scope: ['sdk'] } }, requestClientToolCall } as never)
    await handleInspectFeatureCompleteness({ previousToolCallFinished: Promise.resolve(), toolCall: { toolName: 'inspect_feature_completeness', toolCallId: 'feature', input: { feature: 'resume plan', snapshot_id: 'snap' } }, requestClientToolCall } as never)
    await handleEvaluateAuditCoverage({ previousToolCallFinished: Promise.resolve(), toolCall: { toolName: 'evaluate_audit_coverage', toolCallId: 'coverage', input: { snapshot_id: 'snap', structural_receipts: ['sdk'], features: ['resume plan'] } }, requestClientToolCall } as never)
    expect(calls).toHaveLength(3)
    expect(calls[2]).toMatchObject({ toolName: 'evaluate_audit_coverage', input: { snapshot_id: 'snap', structural_receipts: ['sdk'] } })
  })
})
