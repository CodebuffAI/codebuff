import { describe, expect, test } from 'bun:test'

import { getAllPublishAgentIds } from '../../components/publish-confirmation'

import type { LocalAgentInfo } from '../../utils/local-agent-registry'

const makeAgent = (id: string, isBundled = false): LocalAgentInfo => ({
  id,
  displayName: id,
  filePath: `/agents/${id}.ts`,
  isBundled,
})

describe('getAllPublishAgentIds', () => {
  test('ignores bundled agents even if selected', () => {
    const base = makeAgent('base', true)
    const userA = makeAgent('user-a')
    const agents = [base, userA]
    const defs = new Map<string, { spawnableAgents?: string[] }>()

    const ids = getAllPublishAgentIds([base, userA], agents, defs)

    expect(ids).toEqual(['user-a'])
  })

  test('does not include bundled dependencies discovered via spawns', () => {
    const base = makeAgent('base', true)
    const userA = makeAgent('user-a')
    const agents = [base, userA]
    const defs = new Map<string, { spawnableAgents?: string[] }>([
      ['user-a', { spawnableAgents: ['base'] }],
    ])

    const ids = getAllPublishAgentIds([userA], agents, defs)

    expect(ids).toEqual(['user-a'])
  })

  test('only adds publishable dependents when includeDependents is true', () => {
    const base = makeAgent('base', true)
    const userA = makeAgent('user-a')
    const userB = makeAgent('user-b')
    const agents = [base, userA, userB]
    const defs = new Map<string, { spawnableAgents?: string[] }>([
      ['user-a', { spawnableAgents: [] }],
      ['user-b', { spawnableAgents: ['user-a'] }],
      ['base', { spawnableAgents: ['user-a'] }],
    ])

    const ids = getAllPublishAgentIds([userA], agents, defs, true)

    expect(ids).toEqual(['user-a', 'user-b'])
  })

  test('includes transitive dependents when includeDependents is true', () => {
    const userA = makeAgent('user-a')
    const userB = makeAgent('user-b')
    const userC = makeAgent('user-c')
    const agents = [userA, userB, userC]
    const defs = new Map<string, { spawnableAgents?: string[] }>([
      ['user-a', { spawnableAgents: [] }],
      ['user-b', { spawnableAgents: ['user-a'] }],
      ['user-c', { spawnableAgents: ['user-b'] }],
    ])

    const ids = getAllPublishAgentIds([userA], agents, defs, true)

    expect(ids).toEqual(['user-a', 'user-b', 'user-c'])
  })
})
