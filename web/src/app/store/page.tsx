import { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import AgentStoreClient from './store-client'

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
  weekly_spent?: number // In dollars
  total_spent?: number // In dollars
  avg_cost_per_invocation?: number // In dollars
  unique_users?: number
  last_used?: string
  version_stats?: Record<
    string,
    {
      weekly_dollars: number
      total_dollars: number
      total_invocations: number
      avg_cost_per_run: number
      unique_users: number
      last_used?: Date
    }
  >
  tags?: string[]
}

interface PublisherProfileResponse {
  id: string
  name: string
  verified: boolean
  avatar_url?: string | null
}

// Cache the agents data with 60 second revalidation
const getCachedAgentsData = unstable_cache(
  async (): Promise<AgentData[]> => {
    const baseUrl =
      process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/agents`, {
      headers: {
        'User-Agent': 'Codebuff-Store-Static',
      },
    })

    if (!response.ok) {
      console.error(
        'Failed to fetch agents:',
        response.status,
        response.statusText
      )
      return []
    }

    return await response.json()
  },
  ['store-agents-data'],
  {
    revalidate: 60, // Revalidate every 60 seconds
    tags: ['agents', 'store'],
  }
)

export const metadata: Metadata = {
  title: 'Agent Store | Codebuff',
  description: 'Browse all published AI agents. Run, compose, or fork them.',
  openGraph: {
    title: 'Agent Store | Codebuff',
    description: 'Browse all published AI agents. Run, compose, or fork them.',
    type: 'website',
  },
}

// Enable static site generation with ISR
export const revalidate = 60 * 10 // Revalidate every 10 minutes
export const dynamic = 'force-static'
export const fetchCache = 'force-cache'

interface StorePageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function StorePage({ searchParams }: StorePageProps) {
  // Fetch agents data at build time
  const agentsData = await getCachedAgentsData()

  // For static generation, we don't pass session data
  // The client will handle authentication state
  const userPublishers: PublisherProfileResponse[] = []

  return (
    <AgentStoreClient
      initialAgents={agentsData}
      initialPublishers={userPublishers}
      session={null} // Client will handle session
      searchParams={searchParams}
    />
  )
}
