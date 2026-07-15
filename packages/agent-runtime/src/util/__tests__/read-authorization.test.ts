import { describe, expect, it } from 'bun:test'

import { revokeImplicitReadAuthorizationsAfterCompaction } from '../read-authorization'

import type { AgentState } from '@codebuff/common/types/session-state'

describe('revokeImplicitReadAuthorizationsAfterCompaction', () => {
  it('revokes implicit whole-file authority and records a typed reread reason', () => {
    const state = {
      readAuthorizationsByPath: { 'src/a.ts': true },
      readAuthorizationHashesByPath: {
        'src/a.ts': 'sha256:a',
        'src/hash-only.ts': 'sha256:b',
      },
      editRereadRequirementsByPath: {
        'src/existing.ts': {
          reason: 'stale_snapshot',
          sourceTool: 'str_replace',
        },
      },
    } as unknown as AgentState

    revokeImplicitReadAuthorizationsAfterCompaction(state)

    expect(state.readAuthorizationsByPath).toEqual({})
    expect(state.readAuthorizationHashesByPath).toEqual({})
    expect(state.editRereadRequirementsByPath).toEqual({
      'src/a.ts': {
        reason: 'context_compacted',
        sourceTool: 'context compaction',
      },
      'src/hash-only.ts': {
        reason: 'context_compacted',
        sourceTool: 'context compaction',
      },
      'src/existing.ts': {
        reason: 'stale_snapshot',
        sourceTool: 'str_replace',
      },
    })
  })
})
