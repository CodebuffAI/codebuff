import { describe, expect, test } from 'bun:test'

import {
  CHANGES,
  MAX_FILE_CHANGES_PER_TRANSACTION,
  MAX_TRANSACTION_UNIQUE_PATHS,
} from '../../actions'
import { editTransactionParams } from '../params/tool/edit-transaction'

describe('edit transaction resource limits', () => {
  test('bounds SDK transaction change count', () => {
    const result = CHANGES.safeParse(
      Array.from(
        { length: MAX_FILE_CHANGES_PER_TRANSACTION + 1 },
        (_, index) => ({
          type: 'file' as const,
          path: `file-${index}.txt`,
          content: 'x',
          expectedHash: null,
        }),
      ),
    )
    expect(result.success).toBe(false)
  })

  test('bounds model-facing unique paths', () => {
    const result = editTransactionParams.inputSchema.safeParse({
      edits: Array.from(
        { length: MAX_TRANSACTION_UNIQUE_PATHS },
        (_, index) => ({
          type: 'move' as const,
          path: `source-${index}.txt`,
          destinationPath: `destination-${index}.txt`,
        }),
      ),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          /unique paths/i.test(issue.message),
        ),
      ).toBe(true)
    }
  })
})
