import { afterEach, describe, expect, test } from 'bun:test'

import { searchRegistry } from './skill-registry'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

/** Stub global fetch with one JSON `skills` payload, recording the called URLs. */
function stubFetch(skills: unknown[], { ok = true }: { ok?: boolean } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input))
    return { ok, json: async () => ({ skills }) } as Response
  }) as typeof fetch
  return calls
}

describe('searchRegistry', () => {
  test('short/empty queries short-circuit without hitting the network', async () => {
    const calls = stubFetch([{ id: 'x', skillId: 'x', source: 'a/b', installs: 1 }])
    expect(await searchRegistry('')).toEqual([])
    expect(await searchRegistry(' a ')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  test('collapses same-named skills, keeping the most-installed', async () => {
    stubFetch([
      { id: '1', skillId: 'docker-patterns', source: 'alice/repo', installs: 100 },
      { id: '2', skillId: 'docker-patterns', source: 'bob/repo', installs: 900 },
      { id: '3', skillId: 'unique', source: 'carol/repo', installs: 50 },
    ])
    const res = await searchRegistry('docker')
    expect(res.map((s) => s.name)).toEqual(['docker-patterns', 'unique'])
    // The surviving duplicate is the higher-install one (bob's, 900).
    expect(res[0]).toMatchObject({ source: 'bob/repo', installs: 900 })
  })

  test('sorts by installs descending and caps the list at 10', async () => {
    // 13 uniquely-named skills with ascending installs → expect top 10, desc.
    const skills = Array.from({ length: 13 }, (_, i) => ({
      id: String(i),
      skillId: `skill-${i}`,
      source: 'o/r',
      installs: i,
    }))
    stubFetch(skills)
    const res = await searchRegistry('many')
    expect(res).toHaveLength(10)
    const installs = res.map((s) => s.installs)
    expect(installs).toEqual([...installs].sort((a, b) => b - a))
    expect(installs[0]).toBe(12)
    expect(installs[9]).toBe(3)
  })

  test('drops entries missing a slug or source', async () => {
    stubFetch([
      { id: '1', skillId: 'good', source: 'o/r', installs: 5 },
      { id: '2', skillId: '', source: 'o/r', installs: 9 }, // no slug
      { id: '3', skillId: 'no-source', source: '', installs: 9 }, // no source
    ])
    const res = await searchRegistry('query')
    expect(res.map((s) => s.name)).toEqual(['good'])
  })

  test('maps registry fields onto the result shape', async () => {
    stubFetch([{ id: 'o/r/slug', name: 'Pretty Name', skillId: 'slug', source: 'o/r', installs: 7 }])
    expect(await searchRegistry('query')).toEqual([
      { id: 'o/r/slug', name: 'Pretty Name', slug: 'slug', source: 'o/r', installs: 7 },
    ])
  })

  test('returns an empty list on a non-ok response or a network error', async () => {
    stubFetch([{ id: '1', skillId: 'x', source: 'o/r', installs: 1 }], { ok: false })
    expect(await searchRegistry('query')).toEqual([])

    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect(await searchRegistry('query')).toEqual([])
  })
})
