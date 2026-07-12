import { describe, expect, it } from 'bun:test'

import { decodeReadCapabilityToken } from '@codebuff/common/util/content-hash'

import { buildFreshWholeFileCapability } from '../tools/mutation-capabilities'

describe('mutation capabilities', () => {
  it('emits a whole-file token that can be reused as basedOnRead', () => {
    const capability = buildFreshWholeFileCapability(
      'src/example.ts',
      'const first = 1\nconst second = 2\n',
    )

    expect(capability.token).toStartWith('cap.')
    expect(decodeReadCapabilityToken(capability.token)).toEqual({
      startLine: 1,
      endLine: 3,
      hash: capability.snapshot.contentHash,
    })
  })
})
