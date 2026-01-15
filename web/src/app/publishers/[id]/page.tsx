import { env } from '@codebuff/common/env'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { User, Mail, Calendar, CheckCircle, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCachedAgentsForStaticParams } from '@/server/agents-data'

interface PublisherPageProps {
  params: Promise<{
    id: string
  }>
}

export async function generateMetadata({ params }: PublisherPageProps) {
  const { id } = await params
  const publisher = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, id))
    .limit(1)

  if (publisher.length === 0) {
    return {
      title: 'Publisher Not Found',
    }
  }

  const title = `${publisher[0].name} - Codebuff Publisher`
  const description =
    publisher[0].bio ||
    `View ${publisher[0].name}'s published agents on Codebuff`
  const ogImages = (
    publisher[0].avatar_url ? [publisher[0].avatar_url] : []
  ) as string[]
  const canonicalUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${id}`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: 'profile',
      images: ogImages,
    },
  }
}

type GroupedAgent = {
  name: string
  description?: string
  versions: Array<{
    id: string
    version: string
    data: any
    created_at: Date
  }>
  latestVersion: string
  totalVersions: number
}

// Breadcrumb JSON-LD for navigation hierarchy
function BreadcrumbJsonLd({
  publisherId,
  publisherName,
}: {
  publisherId: string
  publisherName: string
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
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// JSON-LD structured data for SEO
function PublisherJsonLd({
  publisherId,
  publisherName,
  bio,
  avatarUrl,
  createdAt,
  verified,
  email,
  agents,
}: {
  publisherId: string
  publisherName: string
  bio?: string | null
  avatarUrl?: string | null
  createdAt: Date
  verified: boolean
  email?: string | null
  agents: Array<{
    name: string
    description?: string
    latestVersion: string
    agentId: string
  }>
}) {
  const publisherUrl = `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${publisherId}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': publisherUrl,
    name: publisherName,
    url: publisherUrl,
    description: bio || `${publisherName} is a publisher on Codebuff`,
    ...(avatarUrl && {
      logo: avatarUrl,
      image: avatarUrl,
    }),
    ...(email && { email }),
    foundingDate: createdAt.toISOString().split('T')[0],
    ...(verified && {
      award: 'Verified Publisher',
    }),
    parentOrganization: {
      '@type': 'Organization',
      name: 'Codebuff',
      url: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    },
    // List agents as software products published by this organization
    ...(agents.length > 0 && {
      makesOffer: agents.map((agent) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'SoftwareApplication',
          name: agent.name,
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Cross-platform',
          softwareVersion: agent.latestVersion,
          ...(agent.description && { description: agent.description }),
          url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/publishers/${publisherId}/agents/${agent.agentId}/${agent.latestVersion}`,
        },
        price: '0',
        priceCurrency: 'USD',
      })),
    }),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

const PublisherPage = async ({ params }: PublisherPageProps) => {
  const { id } = await params
  const publisher = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, id))
    .limit(1)

  if (publisher.length === 0) {
    notFound()
  }

  const publisherData = publisher[0]

  // Get published agents count
  const agentCount = await db
    .select({ count: schema.agentConfig.id })
    .from(schema.agentConfig)
    .where(eq(schema.agentConfig.publisher_id, publisherData.id))
    .then((result) => result.length)

  // Get published agents (you might want to add pagination later)
  const publishedAgents = await db
    .select({
      id: schema.agentConfig.id,
      version: schema.agentConfig.version,
      data: schema.agentConfig.data,
      created_at: schema.agentConfig.created_at,
    })
    .from(schema.agentConfig)
    .where(eq(schema.agentConfig.publisher_id, publisherData.id))
    .orderBy(schema.agentConfig.created_at)

  // Group agents by name
  const groupedAgents: Record<string, GroupedAgent> = {}

  publishedAgents.forEach((agent) => {
    const agentData =
      typeof agent.data === 'string' ? JSON.parse(agent.data) : agent.data
    const agentName = agentData.name || agent.id

    if (!groupedAgents[agentName]) {
      groupedAgents[agentName] = {
        name: agentName,
        description: agentData.description,
        versions: [],
        latestVersion: agent.version,
        totalVersions: 0,
      }
    }

    groupedAgents[agentName].versions.push({
      id: agent.id,
      version: agent.version,
      data: agentData,
      created_at: agent.created_at,
    })

    // Update latest version (assuming versions are sorted)
    if (
      agent.created_at >
      new Date(groupedAgents[agentName].versions[0]?.created_at || 0)
    ) {
      groupedAgents[agentName].latestVersion = agent.version
      groupedAgents[agentName].description = agentData.description
    }

    groupedAgents[agentName].totalVersions =
      groupedAgents[agentName].versions.length
  })

  const groupedAgentsList = Object.values(groupedAgents).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  // Prepare agents data for JSON-LD
  const agentsForJsonLd = groupedAgentsList.map((groupedAgent) => {
    const sortedVersions = groupedAgent.versions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    return {
      name: groupedAgent.name,
      description: groupedAgent.description,
      latestVersion: sortedVersions[0]?.version || groupedAgent.latestVersion,
      agentId:
        sortedVersions[0]?.id ||
        groupedAgent.versions[0]?.id ||
        groupedAgent.name,
    }
  })

  return (
    <>
      <PublisherJsonLd
        publisherId={publisherData.id}
        publisherName={publisherData.name}
        bio={publisherData.bio}
        avatarUrl={publisherData.avatar_url}
        createdAt={new Date(publisherData.created_at)}
        verified={publisherData.verified}
        email={publisherData.email}
        agents={agentsForJsonLd}
      />
      <BreadcrumbJsonLd
        publisherId={publisherData.id}
        publisherName={publisherData.name}
      />
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto">
          {' '}
          {/* Navigation */}
          <div className="mb-6">
            <BackButton />
          </div>
          {/* Publisher Header */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                {publisherData.avatar_url ? (
                  <Image
                    src={publisherData.avatar_url}
                    alt={`${publisherData.name} avatar`}
                    width={80}
                    height={80}
                    className="rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="h-10 w-10 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                    <CardTitle className="text-xl sm:text-2xl break-words">
                      {publisherData.name}
                    </CardTitle>
                    {publisherData.verified && (
                      <Badge
                        variant="secondary"
                        className="flex items-center space-x-1 self-start sm:self-auto"
                      >
                        <CheckCircle className="h-3 w-3" />
                        <span>Verified</span>
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mb-2 break-all">
                    @{publisherData.id}
                  </p>
                  {publisherData.bio && (
                    <p className="text-sm mb-4">{publisherData.bio}</p>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                    {publisherData.email && (
                      <div className="flex items-center space-x-1 min-w-0">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{publisherData.email}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span>
                        Joined{' '}
                        {new Date(publisherData.created_at).toLocaleDateString(
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
              </div>
            </CardHeader>
          </Card>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold">
                  {groupedAgentsList.length}
                </div>
                <p className="text-sm text-muted-foreground">Unique Agents</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold">{agentCount}</div>
                <p className="text-sm text-muted-foreground">Total Versions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold">
                  {publisherData.verified ? 'Verified' : 'Unverified'}
                </div>
                <p className="text-sm text-muted-foreground">
                  Publisher Status
                </p>
              </CardContent>
            </Card>
          </div>
          {/* Published Agents - Grouped */}
          <Card>
            <CardHeader>
              <CardTitle>Published Agents</CardTitle>
            </CardHeader>
            <CardContent>
              {groupedAgentsList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No agents published yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedAgentsList.map((groupedAgent) => {
                    const sortedVersions = groupedAgent.versions.sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )
                    const latestVersionData = sortedVersions[0]

                    return (
                      <Link
                        key={groupedAgent.name}
                        href={`/publishers/${publisherData.id}/agents/${latestVersionData.id}/${latestVersionData.version}`}
                        className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-semibold text-lg">
                                {groupedAgent.name}
                              </h3>
                              {groupedAgent.totalVersions > 1 && (
                                <Badge variant="secondary">
                                  {groupedAgentsList.find(
                                    (ga) => ga.name === groupedAgent.name,
                                  )?.totalVersions ||
                                    groupedAgent.totalVersions}{' '}
                                  versions
                                </Badge>
                              )}
                            </div>
                            {groupedAgent.description && (
                              <p className="text-sm text-muted-foreground mb-3">
                                {groupedAgent.description}
                              </p>
                            )}
                            {groupedAgent.totalVersions > 1 && (
                              <p className="text-xs text-muted-foreground">
                                Latest: v{latestVersionData.version}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

// ISR Configuration - revalidate every 10 minutes
export const revalidate = 600

// Generate static params for all publishers
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const agents = await getCachedAgentsForStaticParams()
  // Get unique publisher IDs
  const publisherIds = [...new Set(agents.map((agent) => agent.publisher_id))]
  return publisherIds.map((id) => ({ id }))
}

export default PublisherPage
