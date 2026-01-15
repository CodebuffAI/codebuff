import { env } from '@codebuff/common/env'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq } from 'drizzle-orm'
import { Calendar } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AgentDependencyTree } from '@/components/agent/agent-dependency-tree'
import { TypeScriptViewer } from '@/components/agent/typescript-viewer'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getCachedAgentsForStaticParams } from '@/server/agents-data'

import { AgentUsageMetrics } from './agent-usage-metrics'
import { CopyIdButton } from './copy-id-button'
import { RunAgentButton } from './run-agent-button'
import { SaveAgentButton } from './save-agent-button'
import { VersionUsageBadge } from './version-usage-badge'

interface AgentDetailPageProps {
  params: Promise<{
    id: string // publisher id
    agentId: string
    version: string
  }>
}

export async function generateMetadata({ params }: AgentDetailPageProps) {
  const { id, agentId, version } = await params
  const agent = await db
    .select({
      data: schema.agentConfig.data,
      version: schema.agentConfig.version,
      created_at: schema.agentConfig.created_at,
    })
    .from(schema.agentConfig)
    .innerJoin(
      schema.publisher,
      eq(schema.agentConfig.publisher_id, schema.publisher.id),
    )
    .where(
      and(
        eq(schema.publisher.id, id),
        eq(schema.agentConfig.id, agentId),
        eq(schema.agentConfig.version, version),
      ),
    )
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

  const title = `${agentName} v${agent[0].version} - Agent Details`
  const description =
    agentData.description ||
    `View details for ${agentName} version ${agent[0].version}`
  const ogImages = (pub?.[0]?.avatar_url ? [pub[0].avatar_url] : []) as string[]
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${id}/agents/${agentId}/${version}`

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

// JSON-LD structured data for SEO
function AgentJsonLd({
  agentName,
  agentId,
  version,
  description,
  publisherId,
  publisherName,
  createdAt,
}: {
  agentName: string
  agentId: string
  version: string
  description?: string
  publisherId: string
  publisherName: string
  createdAt: Date
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: agentName,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    softwareVersion: version,
    description:
      description || `AI agent ${agentName} for code assistance and automation`,
    url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${publisherId}/agents/${agentId}/${version}`,
    datePublished: createdAt.toISOString(),
    author: {
      '@type': 'Organization',
      name: publisherName,
      url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${publisherId}`,
    },
    provider: {
      '@type': 'Organization',
      name: 'Codebuff',
      url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// Breadcrumb JSON-LD for navigation hierarchy
function BreadcrumbJsonLd({
  publisherId,
  publisherName,
  agentName,
  agentId,
  version,
}: {
  publisherId: string
  publisherName: string
  agentName: string
  agentId: string
  version: string
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Agent Store',
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/store`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: publisherName,
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${publisherId}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: `${agentName} v${version}`,
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${publisherId}/agents/${agentId}/${version}`,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

const AgentDetailPage = async ({ params }: AgentDetailPageProps) => {
  const { id, agentId, version } = await params
  // Get publisher info
  const publisher = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, id))
    .limit(1)

  if (publisher.length === 0) {
    notFound()
  }

  const publisherData = publisher[0]

  // Get agent details
  const agent = await db
    .select()
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, id),
        eq(schema.agentConfig.id, agentId),
        eq(schema.agentConfig.version, version),
      ),
    )
    .limit(1)

  if (agent.length === 0) {
    notFound()
  }

  const agentData =
    typeof agent[0].data === 'string'
      ? JSON.parse(agent[0].data)
      : agent[0].data
  const agentName = agentData.name || agentId

  // Get all versions of this agent for navigation
  const allVersions = await db
    .select({
      version: schema.agentConfig.version,
      created_at: schema.agentConfig.created_at,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, id),
        eq(schema.agentConfig.id, agentId),
      ),
    )
    .orderBy(schema.agentConfig.created_at)

  // Get the latest version for the full agent ID
  const latestVersion =
    allVersions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]?.version || version

  const fullAgentId = `${id}/${agentId}@${latestVersion}`

  return (
    <>
      <AgentJsonLd
        agentName={agentName}
        agentId={agentId}
        version={version}
        description={agentData.description}
        publisherId={id}
        publisherName={publisherData.name}
        createdAt={new Date(agent[0].created_at)}
      />
      <BreadcrumbJsonLd
        publisherId={id}
        publisherName={publisherData.name}
        agentName={agentName}
        agentId={agentId}
        version={version}
      />
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto">
          {' '}
          {/* Navigation */}
          <div className="mb-3">
            <BackButton fallbackUrl="/store">Back to store</BackButton>
          </div>
          {/* Agent Header */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                    <CardTitle className="text-xl sm:text-2xl break-words">
                      {agentName}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="text-sm self-start sm:self-auto"
                    >
                      v{version}
                    </Badge>
                  </div>
                  <div className="mb-2">
                    <Link
                      href={`/publishers/${publisherData.id}`}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={publisherData.avatar_url || undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {publisherData.name[0]?.toUpperCase() ||
                            publisherData.id[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground">
                        @{publisherData.id}
                      </span>
                    </Link>
                  </div>
                  {agentData.description && (
                    <p className="text-sm mb-4">{agentData.description}</p>
                  )}
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Published{' '}
                        {new Date(agent[0].created_at).toLocaleDateString(
                          'en-US',
                          {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          },
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-4 md:border-t-0 md:pt-0">
                  <div className="flex flex-col space-y-2 sm:flex-row sm:items-end sm:space-y-0 sm:space-x-2 md:space-x-3">
                    <CopyIdButton agentId={fullAgentId} />
                    <SaveAgentButton agentId={fullAgentId} />
                    <RunAgentButton agentId={fullAgentId} />
                    {/*
                Hide download button for now. (It doesn't do anything)
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                */}
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Version Navigation */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Versions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-40 overflow-y-auto lg:max-h-none lg:overflow-y-visible">
                    {allVersions
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime(),
                      )
                      .map((v, index) => (
                        <Link
                          key={v.version}
                          href={`/publishers/${id}/agents/${agentId}/${v.version}`}
                        >
                          <Button
                            variant={
                              v.version === version ? 'default' : 'ghost'
                            }
                            size="sm"
                            className="w-full justify-start group transition-colors"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center">
                                <span className="font-mono">v{v.version}</span>
                                {index !== 0 && (
                                  <VersionUsageBadge
                                    publisherId={id}
                                    agentId={agentId}
                                    version={v.version}
                                  />
                                )}
                              </div>
                              {index === 0 && (
                                <Badge
                                  className={cn(
                                    'text-xs px-1.5 py-0 border pointer-events-none',
                                    v.version === version
                                      ? 'bg-background text-foreground border-background'
                                      : 'bg-muted text-muted-foreground border-muted',
                                  )}
                                >
                                  Latest
                                </Badge>
                              )}
                            </div>
                          </Button>
                        </Link>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Agent Definition and Usage Stats Combined */}
            <div className="lg:col-span-3">
              <Card>
                <CardContent className="space-y-6 pt-6">
                  {/* Usage Metrics for this version */}
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      Usage Statistics
                      <Badge variant="secondary" className="text-xs">
                        v{version}
                      </Badge>
                    </h3>
                    <AgentUsageMetrics
                      publisherId={id}
                      agentId={agentId}
                      version={version}
                    />
                  </div>

                  {/* Agent Definition */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-3">Definition</h3>

                    {/* Subagents - part of the definition */}
                    {agentData.spawnableAgents &&
                      agentData.spawnableAgents.length > 0 && (
                        <div className="mb-4">
                          <AgentDependencyTree
                            publisherId={id}
                            agentId={agentId}
                            version={version}
                          />
                        </div>
                      )}

                    <TypeScriptViewer data={agentData} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ISR Configuration - revalidate every 10 minutes
export const revalidate = 600

// Generate static params for all agent versions
export async function generateStaticParams(): Promise<
  Array<{ id: string; agentId: string; version: string }>
> {
  const agents = await getCachedAgentsForStaticParams()
  return agents.map((agent) => ({
    id: agent.publisher_id,
    agentId: agent.id,
    version: agent.version,
  }))
}

export default AgentDetailPage
