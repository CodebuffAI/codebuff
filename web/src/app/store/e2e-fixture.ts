type Agent = {
  id: string
  name: string
  description?: string
  publisher: {
    id: string
    name: string
    verified: boolean
    avatar_url?: string | null
  }
  version: string
  created_at: string
  usage_count?: number
  weekly_runs?: number
  weekly_spent?: number
  total_spent?: number
  avg_cost_per_invocation?: number
  unique_users?: number
  last_used?: string
  version_stats?: Record<string, any>
  tags?: string[]
}

export function getAgentsFixture(): Agent[] {
  return [
    {
      id: 'base',
      name: 'Base',
      description: 'desc',
      publisher: {
        id: 'codebuff',
        name: 'Codebuff',
        verified: true,
        avatar_url: null,
      },
      version: '1.2.3',
      created_at: new Date().toISOString(),
      weekly_spent: 10,
      weekly_runs: 5,
      usage_count: 50,
      total_spent: 100,
      avg_cost_per_invocation: 0.2,
      unique_users: 3,
      last_used: new Date().toISOString(),
      version_stats: {},
      tags: ['test'],
    },
  ]
}

