import { describe, expect, test } from 'bun:test'

import { handleRunTargetedValidation } from '../run-targeted-validation'

describe('handleRunTargetedValidation', () => {
  test('proxies snapshot and validation scope exactly', async () => {
    const result = await handleRunTargetedValidation({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'run_targeted_validation',
        toolCallId: 'validation-tool',
        input: {
          snapshot_id: 'snapshot',
          files: ['src/a.ts'],
          artifact_kinds: ['typescript'],
        },
      },
      requestClientToolCall: async (call: unknown) => {
        expect(call).toMatchObject({
          toolName: 'run_targeted_validation',
          input: {
            snapshot_id: 'snapshot',
            files: ['src/a.ts'],
            artifact_kinds: ['typescript'],
          },
        })
        return [
          {
            type: 'json',
            value: {
              schemaVersion: 1,
              snapshotId: 'snapshot',
              files: ['src/a.ts'],
              artifactKinds: ['typescript'],
              status: 'passed',
              assurance: 'full',
              summary: 'passed',
              results: [],
            },
          },
        ] as never
      },
    } as never)
    expect(result.output[0]).toMatchObject({
      type: 'json',
      value: { status: 'passed' },
    })
  })
})
