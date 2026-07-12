import { describe, expect, test } from 'bun:test'

import { getChangeReviewBundle } from '../tools/get-change-review-bundle'
import { runTargetedValidation } from '../tools/run-targeted-validation'

describe('runTargetedValidation', () => {
  test('fails closed for a stale snapshot', async () => {
    const result = await runTargetedValidation({
      cwd: process.cwd(),
      snapshotId: 'stale-snapshot',
      files: ['README.md'],
      artifactKinds: ['documentation'],
    })
    expect(result[0]).toMatchObject({
      type: 'json',
      value: { status: 'failed', assurance: 'none' },
    })
  })

  test('returns scoped evidence for the current snapshot', async () => {
    const bundle = await getChangeReviewBundle({ cwd: process.cwd() })
    const bundleValue = bundle[0]?.type === 'json' ? bundle[0].value : undefined
    if (!bundleValue || !('snapshotId' in bundleValue)) {
      throw new Error('Expected a change review bundle')
    }
    const result = await runTargetedValidation({
      cwd: process.cwd(),
      snapshotId: bundleValue.snapshotId,
      files: ['README.md'],
      artifactKinds: ['documentation'],
    })
    expect(result[0]).toMatchObject({
      type: 'json',
      value: {
        schemaVersion: 1,
        snapshotId: bundleValue.snapshotId,
        files: ['README.md'],
        artifactKinds: ['documentation'],
      },
    })
  })
})
