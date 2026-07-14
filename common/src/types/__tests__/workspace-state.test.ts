import { describe, expect, test } from 'bun:test'

import {
  advanceWorkspaceState,
  createInitialWorkspaceState,
} from '../workspace-state'

describe('workspace state', () => {
  test('advances monotonically with content-bound snapshot identities', () => {
    const initial = createInitialWorkspaceState(1)
    const first = advanceWorkspaceState(initial, {
      source: 'test',
      operationId: 'op-1',
      occurredAt: 2,
      actions: [
        {
          action: 'update',
          path: 'src/a.ts',
          beforeHash: 'a',
          afterHash: 'b',
        },
      ],
    })
    const second = advanceWorkspaceState(first, {
      source: 'test',
      operationId: 'op-2',
      occurredAt: 3,
      actions: [{ action: 'unknown' }],
    })
    expect(first.revision).toBe(1)
    expect(second.revision).toBe(2)
    expect(first.snapshotId).not.toBe(second.snapshotId)
    expect(second.changes.map((change) => change.revision)).toEqual([1, 2])
  })
})
