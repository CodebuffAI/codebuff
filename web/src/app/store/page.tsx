import { Metadata } from 'next'
import AgentStoreClient from './store-client'

interface PublisherProfileResponse {
  id: string
  name: string
  verified: boolean
  avatar_url?: string | null
}

export async function generateMetadata(): Promise<Metadata> {
  // In E2E mode, avoid DB by using local fixture
  let agents: Array<{
    name?: string
    publisher?: { avatar_url?: string | null }
  }> = []
  try {
    agents =
      process.env.E2E_ENABLE_QUERY_FIXTURE === '1'
        ? (await import('./e2e-fixture')).getAgentsFixture()
        : await (await import('@/server/agents-data')).getCachedAgents()
  } catch {
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
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function StorePage({ searchParams }: StorePageProps) {
  // E2E fixture path to prevent DB dependency during e2e
  const useFixture =
    process.env.E2E_ENABLE_QUERY_FIXTURE === '1' &&
    (searchParams['e2eFixture'] === '1' || searchParams['e2eFixture'] === 'true')

  // Fetch agents data on the server with ISR cache (or use test fixture)
  let agentsData: any[] = []
  try {
    agentsData = useFixture
      ? (await import('./e2e-fixture')).getAgentsFixture()
      : await (await import('@/server/agents-data')).getCachedAgents()
  } catch {
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
      searchParams={searchParams}
    />
  )
}
