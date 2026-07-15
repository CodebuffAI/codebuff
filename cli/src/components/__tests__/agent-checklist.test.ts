import { describe, expect, test } from 'bun:test'

import { buildVisibleAgentRows } from '../agent-checklist'

const agents = [
  { id: 'root', displayName: 'Root', filePath: '/tmp/root.ts' },
  { id: 'child', displayName: 'Child', filePath: '/tmp/child.ts' },
  { id: 'grandchild', displayName: 'Grandchild', filePath: '/tmp/grand.ts' },
]

describe('AgentChecklist focus rows', () => {
  test('includes expanded dependency rows in keyboard navigation order', () => {
    const rows = buildVisibleAgentRows({
      allAgents: agents,
      filteredAgents: [agents[0]],
      expandedAgentIds: new Set(['root']),
      agentDefinitions: new Map([
        ['root', { spawnableAgents: ['child'] }],
        ['child', { spawnableAgents: ['grandchild'] }],
      ]),
    })

    expect(
      rows.map((row) =>
        row.kind === 'agent' ? row.agent.id : row.agentId,
      ),
    ).toEqual(['root', 'child', 'grandchild'])
    expect(rows.map((row) => row.kind)).toEqual([
      'agent',
      'dependency',
      'dependency',
    ])
  })

  test('keeps collapsed dependency rows out of the focus order', () => {
    const rows = buildVisibleAgentRows({
      allAgents: agents,
      filteredAgents: [agents[0]],
      expandedAgentIds: new Set(),
      agentDefinitions: new Map([
        ['root', { spawnableAgents: ['child'] }],
      ]),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'agent' })
  })
})
