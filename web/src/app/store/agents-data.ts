import { unstable_cache } from 'next/cache'

// Types
interface AgentData {
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

// Server-side data fetching function with ISR
export const getAgentsData = unstable_cache(
  async (): Promise<AgentData[]> => {
    const baseUrl =
      process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'

    try {
      const response = await fetch(`${baseUrl}/api/agents`, {
        headers: {
          'User-Agent': 'Codebuff-Store-Static',
        },
        // Configure fetch-level caching
        next: {
          revalidate: 600, // 10 minutes
          tags: ['agents', 'store'],
        },
      })

      if (!response.ok) {
        console.error(
          'Failed to fetch agents:',
          response.status,
          response.statusText,
        )
        return []
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching agents data:', error)
      return []
    }
  },
  ['store-agents-data'],
  {
    revalidate: 600, // Cache for 10 minutes
    tags: ['agents', 'store'],
  },
)

// Helper function for on-demand revalidation (can be used in webhooks/admin actions)
export async function revalidateAgentsData() {
  const { revalidateTag } = await import('next/cache')
  revalidateTag('agents')
  revalidateTag('store')
}
