import { describe, expect, it } from 'bun:test'

import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
  readCapabilityMatchesScope,
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

  it('round-trips authenticated project/path/run-bound v3 capabilities', () => {
    const scope = {
      projectId: '/workspace/project',
      path: 'src/value.ts',
      runId: 'run-123',
    }
    const token = encodeReadCapabilityToken({
      startLine: 4,
      endLine: 8,
      hash: getContentHash('bound content'),
      scope,
    })

    expect(token).toMatch(
      /^cap\.v3\.4\.8\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    )
    const decoded = decodeReadCapabilityToken(token)
    expect(typeof decoded).toBe('object')
    if (typeof decoded !== 'string') {
      expect(decoded.tokenVersion).toBe('v3')
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

  it('rejects tampered v3 capability payloads', () => {
    const token = encodeReadCapabilityToken({
      startLine: 4,
      endLine: 8,
      hash: getContentHash('bound content'),
      scope: {
        projectId: '/workspace/project',
        path: 'src/value.ts',
        runId: 'run-123',
      },
    })
    const tampered = token.replace('cap.v3.4.8.', 'cap.v3.4.9.')

    expect(decodeReadCapabilityToken(tampered)).toContain(
      'authentication failed',
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
