import { describe, expect, test } from 'bun:test'

import { getChangeReviewBundle } from '../tools/get-change-review-bundle'

describe('getChangeReviewBundle', () => {
  test('binds status and diff to a deterministic snapshot id', async () => {
    const first = await getChangeReviewBundle({ cwd: process.cwd() })
    const second = await getChangeReviewBundle({ cwd: process.cwd() })
    const firstValue = first[0]?.type === 'json' ? first[0].value : undefined
    const secondValue = second[0]?.type === 'json' ? second[0].value : undefined
    expect(firstValue).not.toHaveProperty('errorMessage')
    expect(secondValue).not.toHaveProperty('errorMessage')
    expect((firstValue as { snapshotId: string }).snapshotId).toBe(
      (secondValue as { snapshotId: string }).snapshotId,
    )
    expect(Array.isArray((firstValue as { files: unknown }).files)).toBe(true)
    expect(typeof (firstValue as { diff: unknown }).diff).toBe('string')
  })
})
