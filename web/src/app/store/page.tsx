import { Metadata } from 'next'
import AgentStoreClient from './store-client'
import { getAgentsData } from './agents-data'

interface PublisherProfileResponse {
  id: string
  name: string
  verified: boolean
  avatar_url?: string | null
}

export const metadata: Metadata = {
  title: 'Agent Store | Codebuff',
  description: 'Browse all published AI agents. Run, compose, or fork them.',
  openGraph: {
    title: 'Agent Store | Codebuff',
    description: 'Browse all published AI agents. Run, compose, or fork them.',
    type: 'website',
  },
}

// ISR Configuration - revalidate every 10 minutes
export const revalidate = 600
export const dynamic = 'force-static'

interface StorePageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function StorePage({ searchParams }: StorePageProps) {
  // Fetch agents data with ISR
  const agentsData = await getAgentsData()

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
