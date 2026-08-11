import { describe, expect, it } from 'bun:test'

import {
  detectCfWorker,
  looksLikeProxyClientId,
  parseAllowedWorkerZones,
} from '../cf-worker-signals'

const NO_ZONES = new Set<string>()

describe('detectCfWorker', () => {
  it('detects a Worker subrequest that came through our edge', () => {
    expect(
      detectCfWorker({
        cfWorkerHeader: 'freebuff2api.workers.dev',
        cfRayHeader: 'abc123-SJC',
        allowedZones: NO_ZONES,
      }),
    ).toEqual({ detected: true, zone: 'freebuff2api.workers.dev' })
  })

  it('ignores ordinary traffic', () => {
    expect(
      detectCfWorker({
        cfWorkerHeader: null,
        cfRayHeader: 'abc123-SJC',
        allowedZones: NO_ZONES,
      }),
    ).toEqual({ detected: false, reason: 'no_header' })
  })

  it('refuses to act on cf-worker without edge corroboration', () => {
    // This is the whole difference between this detector and the ones that were
    // defeated: without `cf-ray` the header is caller-authored text on a request
    // that never touched Cloudflare, which is exactly as forgeable as a
    // self-reported fingerprint.
    expect(
      detectCfWorker({
        cfWorkerHeader: 'anything.workers.dev',
        cfRayHeader: null,
        allowedZones: NO_ZONES,
      }),
    ).toEqual({ detected: false, reason: 'not_edge_verified' })
  })

  it('never flags our own Workers', () => {
    // app-preview-proxy is a Cloudflare Worker that talks to our API. Banning
    // our own infrastructure is the most obvious way this could go wrong.
    const allowed = parseAllowedWorkerZones('app-preview-proxy, vly-sh-router')
    expect(
      detectCfWorker({
        cfWorkerHeader: 'app-preview-proxy',
        cfRayHeader: 'abc-SJC',
        allowedZones: allowed,
      }),
    ).toEqual({ detected: false, reason: 'allowlisted' })
  })

  it('matches the allowlist case-insensitively and ignores padding', () => {
    const allowed = parseAllowedWorkerZones('  App-Preview-Proxy  ,,  ')
    expect(
      detectCfWorker({
        cfWorkerHeader: '  APP-PREVIEW-PROXY ',
        cfRayHeader: 'abc-SJC',
        allowedZones: allowed,
      }).detected,
    ).toBe(false)
  })

  it('treats a whitespace-only header as absent', () => {
    expect(
      detectCfWorker({
        cfWorkerHeader: '   ',
        cfRayHeader: 'abc-SJC',
        allowedZones: NO_ZONES,
      }),
    ).toEqual({ detected: false, reason: 'no_header' })
  })
})

describe('parseAllowedWorkerZones', () => {
  it('is empty for unset config rather than throwing', () => {
    expect(parseAllowedWorkerZones(undefined).size).toBe(0)
    expect(parseAllowedWorkerZones('').size).toBe(0)
  })
})

describe('looksLikeProxyClientId', () => {
  it('matches the published proxy generator', () => {
    expect(looksLikeProxyClientId('wf-a1b2c3d4')).toBe(true)
  })

  it('does not match our own clients or near-misses', () => {
    for (const id of [
      'enhanced-abc',
      'wf-TOOLONGVALUE',
      'wf-a1b2c3',
      'wf-A1B2C3D4',
      null,
      undefined,
      '',
    ]) {
      expect(looksLikeProxyClientId(id as string)).toBe(false)
    }
  })
})
