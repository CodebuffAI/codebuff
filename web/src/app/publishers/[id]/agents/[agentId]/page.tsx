import { env } from '@codebuff/common/env'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'

interface AgentRedirectPageProps {
  params: {
    id: string // publisher id
    agentId: string
  }
}

export async function generateMetadata({ params }: AgentRedirectPageProps) {
  const agent = await db
    .select({
      data: schema.agentConfig.data,
      version: schema.agentConfig.version,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, params.id),
        eq(schema.agentConfig.id, params.agentId),
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
  const agentName = agentData.name || params.agentId

  // Fetch publisher for OG image
  const pub = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, params.id))
    .limit(1)

  const title = `${agentName} - Agent Details`
  const description =
    agentData.description || `View details for ${agentName} agent`
  const ogImages = (pub?.[0]?.avatar_url ? [pub[0].avatar_url] : []) as string[]

  // Canonical URL points to the versioned page to avoid duplicate content
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${params.id}/agents/${params.agentId}/${agent[0].version}`

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
  // Get the latest version of this agent (most recent by created_at)
  const latestVersion = await db
    .select({
      version: schema.agentConfig.version,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, params.id),
        eq(schema.agentConfig.id, params.agentId),
      ),
    )
    .orderBy(desc(schema.agentConfig.created_at))
    .limit(1)

  if (latestVersion.length === 0) {
    notFound()
  }

  // Redirect to the latest version
  redirect(`/publishers/${params.id}/agents/${params.agentId}/${latestVersion[0].version}`)
}

export default AgentRedirectPage
