import { describe, expect, test } from 'bun:test'

import { quarantinedToolNames, toolNames } from '../constants'
import { toolParams } from '../list'
import { toolMetadata } from '../metadata'

describe('tool metadata', () => {
  test('classifies every native tool exactly once', () => {
    expect(Object.keys(toolMetadata).sort()).toEqual([...toolNames].sort())
  })

  test('quarantine controls reachability and prompt visibility', () => {
    for (const toolName of quarantinedToolNames) {
      expect(toolMetadata[toolName].reachability).toBe('quarantined')
      expect(toolMetadata[toolName].promptVisible).toBe(false)
    }
  })

  test('records read_files as the first v1 filesystem result contract', () => {
    expect(toolMetadata.read_files).toMatchObject({
      kind: 'read',
      scheduling: 'read_only',
      resultContract: 'read_v1',
    })
  })

  test('mutation tool schemas accept their canonical v1 envelopes', () => {
    const mutationOutput = [
      {
        type: 'json' as const,
        value: {
          kind: 'file_mutation_result' as const,
          version: 1 as const,
          operationId: 'operation-1',
          outcome: 'not_applied' as const,
          actions: [
            {
              actionId: 'action-1',
              index: 0,
              action: 'update' as const,
              path: 'src/a.ts',
              outcome: 'not_applied' as const,
              beforeHash: 'sha256:before',
              afterHash: 'sha256:before',
            },
          ],
          authorityTier: 'portable_path' as const,
          errors: [],
          freshCapabilities: [],
        },
      },
    ]
    for (const toolName of [
      'apply_patch',
      'apply_smart_patch',
      'create_plan',
      'edit_transaction',
      'replace_range',
      'rewrite_symbol',
      'str_replace',
      'update_plan_status',
      'write_file',
    ] as const) {
      expect(
        toolParams[toolName].outputSchema.safeParse(mutationOutput).success,
      ).toBe(true)
    }
  })
})
