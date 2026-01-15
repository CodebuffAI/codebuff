import { env } from '@codebuff/common/env'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'

import { getCachedAgentsForStaticParams } from '@/server/agents-data'

interface AgentRedirectPageProps {
  params: Promise<{
    id: string // publisher id
    agentId: string
  }>
}

export async function generateMetadata({ params }: AgentRedirectPageProps) {
  const { id, agentId } = await params
  const agent = await db
    .select({
      data: schema.agentConfig.data,
      version: schema.agentConfig.version,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, id),
        eq(schema.agentConfig.id, agentId),
      ),
    )
    .orderBy(desc(schema.agentConfig.created_at))
    .limit(1)

  if (agent.length === 0) {
    return {
      title: 'Agent Not Found',
    }
  }

  const agentData =
    typeof agent[0].data === 'string'
      ? JSON.parse(agent[0].data)
      : agent[0].data
  const agentName = agentData.name || agentId

  // Fetch publisher for OG image
  const pub = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, id))
    .limit(1)

  const title = `${agentName} - Agent Details`
  const description =
    agentData.description || `View details for ${agentName} agent`
  const ogImages = (pub?.[0]?.avatar_url ? [pub[0].avatar_url] : []) as string[]

  // Canonical URL points to the versioned page to avoid duplicate content
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${id}/agents/${agentId}/${agent[0].version}`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: 'article',
      images: ogImages,
    },
  }
}

/**
 * This page redirects to the latest version of an agent.
 * URL: /publishers/{publisherId}/agents/{agentId}
 * Redirects to: /publishers/{publisherId}/agents/{agentId}/{latestVersion}
 */
const AgentRedirectPage = async ({ params }: AgentRedirectPageProps) => {
  const { id, agentId } = await params
  // Get the latest version of this agent (most recent by created_at)
  const latestVersion = await db
    .select({
      version: schema.agentConfig.version,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, id),
        eq(schema.agentConfig.id, agentId),
      ),
    )
    .orderBy(desc(schema.agentConfig.created_at))
    .limit(1)

  if (latestVersion.length === 0) {
    notFound()
  }

  // Redirect to the latest version
  redirect(`/publishers/${id}/agents/${agentId}/${latestVersion[0].version}`)
}

// ISR Configuration - revalidate every 10 minutes
export const revalidate = 600

// Generate static params for all agents
export async function generateStaticParams(): Promise<
  Array<{ id: string; agentId: string }>
> {
  const agents = await getCachedAgentsForStaticParams()
  // Get unique publisher_id + agent_id combinations
  const uniqueAgents = new Map<string, { id: string; agentId: string }>()
  for (const agent of agents) {
    const key = `${agent.publisher_id}/${agent.id}`
    if (!uniqueAgents.has(key)) {
      uniqueAgents.set(key, { id: agent.publisher_id, agentId: agent.id })
    }
  }
  return Array.from(uniqueAgents.values())
}

export default AgentRedirectPage
