import { describe, expect, test } from 'bun:test'

import { extractAuthSessions } from '../project-dir'

const PROD = 'https://www.codebuff.com'
const DEV = 'http://localhost:3000'

describe('extractAuthSessions — per-host sign-ins', () => {
  test('per-host entries are isolated: each host resolves only its own token', () => {
    const sessions = extractAuthSessions({
      authSessions: {
        [PROD]: { token: 'prod-t', user: { name: 'P' } },
        [DEV]: { token: 'dev-t', user: { name: 'D' } },
      },
    })
    expect(sessions[PROD]).toEqual({ token: 'prod-t', user: { name: 'P' } })
    expect(sessions[DEV]).toEqual({ token: 'dev-t', user: { name: 'D' } })
    expect(sessions['https://other.example']).toBeUndefined()
  })

  test('legacy single-slot fields fold in as one entry under their recorded host', () => {
    const sessions = extractAuthSessions({
      authToken: 'legacy-t',
      authHost: DEV,
      authUser: { name: 'L' },
    })
    expect(sessions[DEV]).toEqual({ token: 'legacy-t', user: { name: 'L' } })
    expect(sessions[PROD]).toBeUndefined()
  })

  test('legacy hostless tokens count as prod-minted (packaged installs only targeted prod)', () => {
    const sessions = extractAuthSessions({ authToken: 'legacy-t', authUser: { name: 'L' } })
    expect(sessions[PROD]?.token).toBe('legacy-t')
    // …and stay invisible to a dev host, so a dev launch can't send or wipe them.
    expect(sessions[DEV]).toBeUndefined()
  })

  test('an explicit per-host entry wins over a legacy entry for the same host', () => {
    const sessions = extractAuthSessions({
      authToken: 'old-t',
      authHost: PROD,
      authSessions: { [PROD]: { token: 'new-t' } },
    })
    expect(sessions[PROD]?.token).toBe('new-t')
  })

  test('malformed entries are dropped, empty state yields no sessions', () => {
    expect(extractAuthSessions({})).toEqual({})
    const sessions = extractAuthSessions({
      authToken: '',
      authSessions: { [DEV]: { token: '' }, [PROD]: 'nonsense', x: null },
    })
    expect(sessions).toEqual({})
  })
})
