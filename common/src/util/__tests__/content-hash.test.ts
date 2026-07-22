import { describe, expect, it } from 'bun:test'

import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
  readCapabilityMatchesScope,
} from '../content-hash'

const scope = {
  projectId: '/workspace/project',
  path: 'src/value.ts',
  runId: 'run-123',
}

describe('read capabilities', () => {
  it('round-trips authenticated project/path/run-bound cap.v3 capabilities', () => {
    const capability = {
      startLine: 4,
      endLine: 8,
      hash: getContentHash('bound content'),
      scope,
    }
    const token = encodeReadCapabilityToken(capability)

    expect(token).toMatch(
      /^cap\.v3\.4\.8\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    )
    const decoded = decodeReadCapabilityToken(token)
    expect(typeof decoded).toBe('object')
    if (typeof decoded !== 'string') {
      expect(decoded).toMatchObject({
        startLine: capability.startLine,
        endLine: capability.endLine,
        hash: capability.hash,
        tokenVersion: 'v3',
      })
      expect(decoded.scopeFingerprint).toHaveLength(43)
      expect(readCapabilityMatchesScope(decoded, scope)).toBe(true)
      expect(
        readCapabilityMatchesScope(decoded, {
          ...scope,
          path: 'src/other.ts',
        }),
      ).toBe(false)
      expect(
        readCapabilityMatchesScope(decoded, { ...scope, runId: 'other-run' }),
      ).toBe(false)
    }
  })

  it('accepts harmless wrappers copied from a read result', () => {
    const token = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 1,
      hash: getContentHash('value'),
      scope,
    })

    expect(
      decodeReadCapabilityToken(`readCapability=\"${token}\"`),
    ).toEqual(decodeReadCapabilityToken(token))
  })

  it('requires a canonical sha256 hash when encoding', () => {
    expect(() =>
      encodeReadCapabilityToken({
        startLine: 1,
        endLine: 1,
        hash: 'legacy-hash',
        scope,
      }),
    ).toThrow('canonical sha256')
  })

  it('rejects tampered cap.v3 capability payloads', () => {
    const token = encodeReadCapabilityToken({
      startLine: 4,
      endLine: 8,
      hash: getContentHash('bound content'),
      scope,
    })
    const tampered = token.replace('cap.v3.4.8.', 'cap.v3.4.9.')

    expect(decodeReadCapabilityToken(tampered)).toContain(
      'authentication failed',
    )
  })

  it('rejects cap.v2 tokens with a targeted re-read error', () => {
    const digest = Buffer.from('a'.repeat(64), 'hex').toString('base64url')
    const decoded = decodeReadCapabilityToken(`cap.v2.2.5.${digest}`)

    expect(decoded).toContain('expected an authenticated scoped cap.v3')
    expect(decoded).toContain('Re-read the target')
  })

  it('rejects legacy base64 payload tokens with a targeted re-read error', () => {
    const token = `cap.${Buffer.from(
      `2:5:${getContentHash('legacy')}`,
    ).toString('base64url')}`
    const decoded = decodeReadCapabilityToken(token)

    expect(decoded).toContain('expected an authenticated scoped cap.v3')
    expect(decoded).toContain('Re-read the target')
  })

  it('identifies legacy whole-file mutation tokens', () => {
    const decoded = decodeReadCapabilityToken('whole.legacy-token')

    expect(decoded).toContain('legacy mutation capability')
    expect(decoded).toContain('Re-read the target')
  })
})
