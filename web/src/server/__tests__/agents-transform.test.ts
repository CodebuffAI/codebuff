import { describe, it, expect } from '@jest/globals'
import { buildAgentsData, type AgentRow } from '../agents-transform'

describe('buildAgentsData', () => {
  it('dedupes by latest and merges metrics + sorts by weekly_spent', () => {
    const agents: AgentRow[] = [
      {
        id: 'base',
        version: '1.0.0',
        data: { name: 'Base', description: 'desc', tags: ['x'] },
        created_at: '2025-01-01T00:00:00.000Z',
        publisher: { id: 'codebuff', name: 'Codebuff', verified: true, avatar_url: null },
      },
      // older duplicate by name should be ignored due to first-seen is latest ordering
      {
        id: 'base-old',
        version: '0.9.0',
        data: { name: 'Base', description: 'old' },
        created_at: '2024-12-01T00:00:00.000Z',
        publisher: { id: 'codebuff', name: 'Codebuff', verified: true, avatar_url: null },
      },
      {
        id: 'reviewer',
        version: '2.1.0',
        data: { name: 'Reviewer' },
        created_at: '2025-01-03T00:00:00.000Z',
        publisher: { id: 'codebuff', name: 'Codebuff', verified: true, avatar_url: null },
      },
    ]

    const usageMetrics = [
      {
        publisher_id: 'codebuff',
        agent_name: 'Base',
        total_invocations: 50,
        total_dollars: 100,
        avg_cost_per_run: 2,
        unique_users: 4,
        last_used: new Date('2025-01-05T00:00:00.000Z'),
      },
      {
        publisher_id: 'codebuff',
        agent_name: 'reviewer',
        total_invocations: 5,
        total_dollars: 5,
        avg_cost_per_run: 1,
        unique_users: 1,
        last_used: new Date('2025-01-04T00:00:00.000Z'),
      },
    ]

    const weeklyMetrics = [
      { publisher_id: 'codebuff', agent_name: 'Base', weekly_runs: 10, weekly_dollars: 20 },
      { publisher_id: 'codebuff', agent_name: 'reviewer', weekly_runs: 2, weekly_dollars: 1 },
    ]

    const perVersionMetrics = [
      {
        publisher_id: 'codebuff',
        agent_name: 'base',
        agent_version: '1.0.0',
        total_invocations: 10,
        total_dollars: 20,
        avg_cost_per_run: 2,
        unique_users: 3,
        last_used: new Date('2025-01-05T00:00:00.000Z'),
      },
    ]

    const perVersionWeeklyMetrics = [
      {
        publisher_id: 'codebuff',
        agent_name: 'base',
        agent_version: '1.0.0',
        weekly_runs: 3,
        weekly_dollars: 6,
      },
    ]

    const out = buildAgentsData({
      agents,
      usageMetrics: usageMetrics as any,
      weeklyMetrics: weeklyMetrics as any,
      perVersionMetrics: perVersionMetrics as any,
      perVersionWeeklyMetrics: perVersionWeeklyMetrics as any,
    })

    // should have deduped to two agents
    expect(out.length).toBe(2)

    const base = out.find((a) => a.id === 'base')!
    expect(base.name).toBe('Base')
    expect(base.weekly_spent).toBe(20)
    expect(base.weekly_runs).toBe(10)
    expect(base.total_spent).toBe(100)
    expect(base.usage_count).toBe(50)
    expect(base.avg_cost_per_invocation).toBe(2)
    expect(base.unique_users).toBe(4)
    expect(base.version_stats?.['1.0.0']).toMatchObject({ weekly_runs: 3, weekly_dollars: 6 })

    // sorted by weekly_spent desc
    expect(out[0].weekly_spent! >= out[1].weekly_spent!).toBe(true)
  })
})

