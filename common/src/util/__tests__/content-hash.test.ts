import { describe, expect, it } from 'bun:test'

import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
} from '../content-hash'

describe('read capability errors', () => {
  it('round-trips the shorter v2 capability format', () => {
    const capability = {
      startLine: 12,
      endLine: 34,
      hash: getContentHash('const value = 1\n'),
    }
    const token = encodeReadCapabilityToken(capability)

    expect(token).toMatch(/^cap\.v2\.12\.34\.[A-Za-z0-9_-]{43}$/)
    expect(token.length).toBeLessThan(70)
    expect(decodeReadCapabilityToken(token)).toEqual(capability)
  })

  it('accepts harmless wrappers copied from a read result', () => {
    const capability = {
      startLine: 1,
      endLine: 1,
      hash: getContentHash('value'),
    }
    const token = encodeReadCapabilityToken(capability)

    expect(decodeReadCapabilityToken(`readCapability=\"${token}\"`)).toEqual(
      capability,
    )
  })

  it('continues to decode legacy base64 payload tokens', () => {
    const capability = {
      startLine: 2,
      endLine: 5,
      hash: getContentHash('legacy'),
    }
    const token = `cap.${Buffer.from(
      `${capability.startLine}:${capability.endLine}:${capability.hash}`,
    ).toString('base64url')}`

    expect(decodeReadCapabilityToken(token)).toEqual(capability)
  })

  it('identifies legacy whole-file mutation tokens', () => {
    expect(decodeReadCapabilityToken('whole.legacy-token')).toContain(
      'legacy mutation capability',
    )
  })
})
