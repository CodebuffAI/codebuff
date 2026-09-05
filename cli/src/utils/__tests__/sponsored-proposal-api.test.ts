import { afterEach, describe, expect, mock, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

ensureCliTestEnv()

const { fetchSponsoredProposal } = await import('../sponsored-proposal-api')

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

const proposal = {
  _id: 'proposal-1',
  advertiser_id: 'adv-acme',
  state: 'offered' as const,
  advertiser_name: 'Acme Deploys',
  headline: 'Add deploy previews',
  body: 'Wire deploy previews into this repository.',
}

function respond(body: unknown, status = 200): void {
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

describe('fetchSponsoredProposal', () => {
  test('returns present for a valid proposal payload', async () => {
    respond({ proposal })
    expect(await fetchSponsoredProposal('Acme/Deploys', 'token')).toEqual({
      status: 'present',
      proposal,
    })
  })

  test('only an authoritative 200 null is absent', async () => {
    respond({ proposal: null })
    expect(await fetchSponsoredProposal('acme/deploys', 'token')).toEqual({
      status: 'absent',
    })
  })

  test('an HTTP failure is unavailable rather than absent', async () => {
    respond({ error: 'temporary' }, 503)
    expect(await fetchSponsoredProposal('acme/deploys', 'token')).toEqual({
      status: 'unavailable',
    })
  })

  test('a transport failure is unavailable rather than absent', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await fetchSponsoredProposal('acme/deploys', 'token')).toEqual({
      status: 'unavailable',
    })
  })

  test('a malformed success is unavailable rather than current data', async () => {
    respond({ proposal: { ...proposal, steps: 'not-an-array' } })
    expect(await fetchSponsoredProposal('acme/deploys', 'token')).toEqual({
      status: 'unavailable',
    })
  })
})
