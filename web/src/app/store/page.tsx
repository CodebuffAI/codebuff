import { Metadata } from 'next'
import { Suspense } from 'react'
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

// Server Component for fetching and rendering agents data
async function AgentsDataProvider({
  searchParams,
}: {
  searchParams: StorePageProps['searchParams']
}) {
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

// Loading component for better UX
function AgentsLoading() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Agent Store</h1>
          <p className="text-xl text-muted-foreground">
            Browse all published AI agents. Run, compose, or fork them.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[220px] bg-card/50 border rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function StorePage({ searchParams }: StorePageProps) {
  return (
    <Suspense fallback={<AgentsLoading />}>
      <AgentsDataProvider searchParams={searchParams} />
    </Suspense>
  )
}
