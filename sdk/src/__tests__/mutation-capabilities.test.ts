import { describe, expect, it } from 'bun:test'

import {
  decodeReadCapabilityToken,
  getContentHash,
  getExactContentHash,
  readCapabilityMatchesScope,
} from '@codebuff/common/util/content-hash'

import { buildFreshWholeFileCapability } from '../tools/mutation-capabilities'

describe('mutation capabilities', () => {
  it('emits a scoped cap.v3 token while snapshotting exact committed bytes', () => {
    const capabilityIssuer = {
      projectId: '/project',
      runId: 'run-mutation-1',
    }
    const content = 'const first = 1\r\nconst second = 2\r\n'
    const capability = buildFreshWholeFileCapability({
      canonicalPath: '/project/src/example.ts',
      path: 'src/example.ts',
      content,
      capabilityIssuer,
    })

    expect(capability.token).toStartWith('cap.v3.')
    const decoded = decodeReadCapabilityToken(capability.token)
    if (typeof decoded === 'string') throw new Error(decoded)
    expect(decoded).toMatchObject({
      startLine: 1,
      endLine: 3,
      hash: getContentHash(content),
      tokenVersion: 'v3',
    })
    expect(capability.snapshot.contentHash).toBe(getExactContentHash(content))
    expect(capability.snapshot.contentHash).not.toBe(decoded.hash)
    expect(
      readCapabilityMatchesScope(decoded, {
        ...capabilityIssuer,
        path: 'src/example.ts',
      }),
    ).toBe(true)
  })
})
