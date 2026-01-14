import { Metadata } from 'next'
import { env } from '@codebuff/common/env'
import { getCachedAgentsBasicInfo } from '@/server/agents-data'
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
    agents = await getCachedAgentsBasicInfo()
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

  // Canonical URL strips query params to prevent duplicate content
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/store`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
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

// JSON-LD structured data for the store page (ItemList schema)
function StoreJsonLd({ agentCount }: { agentCount: number }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Codebuff Agent Store',
    description: `Browse ${agentCount} AI agents for code assistance, automation, and development workflows.`,
    url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/store`,
    mainEntity: {
      '@type': 'ItemList',
      name: 'AI Agents',
      description: 'Published AI agents available for use with Codebuff',
      numberOfItems: agentCount,
      itemListElement: {
        '@type': 'ListItem',
        name: 'AI Agent',
      },
    },
    provider: {
      '@type': 'Organization',
      name: 'Codebuff',
      url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const resolvedSearchParams = await searchParams
  // Fetch only basic agent info on the server - metrics load client-side
  // This keeps the initial payload small and cacheable
  let agentsData: any[] = []
  try {
    agentsData = await getCachedAgentsBasicInfo()
  } catch (error) {
    console.error('[Store] Failed to fetch agents data:', error)
    agentsData = []
  }

  // For static generation, we don't pass session data
  // The client will handle authentication state
  const userPublishers: PublisherProfileResponse[] = []

  return (
    <>
      <StoreJsonLd agentCount={agentsData.length} />
      <AgentStoreClient
        initialAgents={agentsData}
        initialPublishers={userPublishers}
        session={null} // Client will handle session
        searchParams={resolvedSearchParams}
      />
    </>
  )
}
