import { Metadata } from 'next'
import { getCachedAgentsLite } from '@/server/agents-data'
import AgentStoreClient from './store-client'

interface PublisherProfileResponse {
  id: string
  name: string
  verified: boolean
  avatar_url?: string | null
}

export async function generateMetadata(): Promise<Metadata> {
  let agents: Array<{
    name?: string
    publisher?: { avatar_url?: string | null }
  }> = []
  try {
    agents = await getCachedAgentsLite()
  } catch (error) {
    console.error('[Store] Failed to fetch agents for metadata:', error)
    agents = []
  }
  const count = agents.length
  const firstAgent = agents[0]?.name
  const title =
    count > 0
      ? `Agent Store – ${count} Agents Available | Codebuff`
      : 'Agent Store | Codebuff'
  const description =
    count > 0
      ? `Browse ${count} Codebuff agents including ${firstAgent} and more.`
      : 'Browse all published AI agents. Run, compose, or fork them.'

  const ogImages = agents
    .map((a) => a.publisher?.avatar_url)
    .filter((u): u is string => !!u)
    .slice(0, 3)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: ogImages,
    },
  }
}

// ISR Configuration - revalidate every 10 minutes
export const revalidate = 600
export const dynamic = 'force-static'

interface StorePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const resolvedSearchParams = await searchParams
  // Fetch agents data on the server with ISR cache
  let agentsData: any[] = []
  try {
    agentsData = await getCachedAgentsLite()
  } catch (error) {
    console.error('[Store] Failed to fetch agents data:', error)
    agentsData = []
  }

  // For static generation, we don't pass session data
  // The client will handle authentication state
  const userPublishers: PublisherProfileResponse[] = []

  return (
    <AgentStoreClient
      initialAgents={agentsData}
      initialPublishers={userPublishers}
      session={null} // Client will handle session
      searchParams={resolvedSearchParams}
    />
  )
}
