import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { User, Mail, Calendar, CheckCircle, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'

interface PublisherPageProps {
  params: {
    id: string
  }
}

export async function generateMetadata({ params }: PublisherPageProps) {
  const publisher = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, params.id))
    .limit(1)

  if (publisher.length === 0) {
    return {
      title: 'Publisher Not Found',
    }
  }

  return {
    title: `${publisher[0].name} - Codebuff Publisher`,
    description:
      publisher[0].bio ||
      `View ${publisher[0].name}'s published agents on Codebuff`,
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

const PublisherPage = async ({ params }: PublisherPageProps) => {
  const publisher = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, params.id))
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
    a.name.localeCompare(b.name)
  )

  return (
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
            <div className="flex items-start space-x-4">
              {publisherData.avatar_url ? (
                <Image
                  src={publisherData.avatar_url}
                  alt={`${publisherData.name} avatar`}
                  width={80}
                  height={80}
                  className="rounded-full"
                />
              ) : (
                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="h-10 w-10 text-gray-500" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <CardTitle className="text-2xl">
                    {publisherData.name}
                  </CardTitle>
                  {publisherData.verified && (
                    <Badge
                      variant="secondary"
                      className="flex items-center space-x-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      <span>Verified</span>
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-2">
                  @{publisherData.id}
                </p>
                {publisherData.bio && (
                  <p className="text-sm mb-4">{publisherData.bio}</p>
                )}
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  {publisherData.email && (
                    <div className="flex items-center space-x-1">
                      <Mail className="h-4 w-4" />
                      <span>{publisherData.email}</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Joined{' '}
                      {new Date(publisherData.created_at).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        }
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
              <p className="text-sm text-muted-foreground">Publisher Status</p>
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
                      new Date(a.created_at).getTime()
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
                                {groupedAgent.totalVersions} versions
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
  )
}

export default PublisherPage
