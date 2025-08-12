import { resolveAndValidateSubagents, SubagentResolutionError, type AgentVersionEntry } from '../subagent-resolution'

describe('resolveAndValidateSubagents', () => {
  const requestedPublisherId = 'me'

  function makeAgents(entries: { id: string; version: string; spawnableAgents?: string[] }[]): AgentVersionEntry[] {
    return entries.map((e) => ({ id: e.id, version: e.version, data: { id: e.id, version: e.version, spawnableAgents: e.spawnableAgents } }))
  }

  test('simple same-publisher id resolves to batch version when present', async () => {
    const agents = makeAgents([
      { id: 'file-explorer', version: '1.0.10', spawnableAgents: ['file-picker'] },
      { id: 'file-picker', version: '1.0.11' },
    ])

    const exists = (full: string) => full === 'me/file-picker@1.0.11' || full === 'me/file-explorer@1.0.10'
    const latest = async () => null

    await resolveAndValidateSubagents({
      agents,
      requestedPublisherId,
      existsInSamePublisher: exists,
      getLatestPublishedVersion: latest,
    })

    expect(agents[0].data.spawnableAgents).toEqual(['me/file-picker@1.0.11'])
  })

  test('simple same-publisher id resolves to latest published when not in batch', async () => {
    const agents = makeAgents([
      { id: 'file-explorer', version: '1.0.10', spawnableAgents: ['file-picker'] },
    ])

    const exists = (full: string) => full === 'me/file-explorer@1.0.10' || full === 'me/file-picker@1.0.9'
    const latest = async (pub: string, id: string) => (pub === 'me' && id === 'file-picker' ? '1.0.9' : null)

    await resolveAndValidateSubagents({ agents, requestedPublisherId, existsInSamePublisher: exists, getLatestPublishedVersion: latest })

    expect(agents[0].data.spawnableAgents).toEqual(['me/file-picker@1.0.9'])
  })

  test('fully-qualified same-publisher refs are kept and validated', async () => {
    const agents = makeAgents([
      { id: 'file-explorer', version: '1.0.10', spawnableAgents: ['me/file-picker@1.0.8'] },
    ])

    const exists = (full: string) => full === 'me/file-picker@1.0.8' || full === 'me/file-explorer@1.0.10'
    const latest = async () => null

    await resolveAndValidateSubagents({ agents, requestedPublisherId, existsInSamePublisher: exists, getLatestPublishedVersion: latest })

    expect(agents[0].data.spawnableAgents).toEqual(['me/file-picker@1.0.8'])
  })

  test('cross-publisher simple refs resolve to latest without same-publisher validation', async () => {
    const agents = makeAgents([
      { id: 'file-explorer', version: '1.0.10', spawnableAgents: ['other/file-picker'] },
    ])

    const exists = (full: string) => full === 'me/file-explorer@1.0.10'
    const latest = async (pub: string, id: string) => (pub === 'other' && id === 'file-picker' ? '2.0.1' : null)

    await resolveAndValidateSubagents({ agents, requestedPublisherId, existsInSamePublisher: exists, getLatestPublishedVersion: latest })

    expect(agents[0].data.spawnableAgents).toEqual(['other/file-picker@2.0.1'])
  })

  test('throws when simple ref has no published versions', async () => {
    const agents = makeAgents([
      { id: 'file-explorer', version: '1.0.10', spawnableAgents: ['missing'] },
    ])

    const exists = (full: string) => full === 'me/file-explorer@1.0.10'
    const latest = async () => null

    await expect(
      resolveAndValidateSubagents({ agents, requestedPublisherId, existsInSamePublisher: exists, getLatestPublishedVersion: latest })
    ).rejects.toBeInstanceOf(SubagentResolutionError)
  })

  test('throws when fully-qualified same-publisher ref does not exist', async () => {
    const agents = makeAgents([
      { id: 'file-explorer', version: '1.0.10', spawnableAgents: ['me/file-picker@1.0.0'] },
    ])

    const exists = (full: string) => full === 'me/file-explorer@1.0.10' // not the picker
    const latest = async () => null

    await expect(
      resolveAndValidateSubagents({ agents, requestedPublisherId, existsInSamePublisher: exists, getLatestPublishedVersion: latest })
    ).rejects.toBeInstanceOf(SubagentResolutionError)
  })
})
