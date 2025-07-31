import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq } from 'drizzle-orm'
import { ArrowLeft, Calendar, Code, Download, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { JsonViewer } from '@/components/agent/json-viewer'
import { cn } from '@/lib/utils'

interface AgentDetailPageProps {
  params: {
    id: string // publisher id
    agentId: string
    version: string
  }
}

export async function generateMetadata({ params }: AgentDetailPageProps) {
  const agent = await db
    .select({
      data: schema.agentConfig.data,
      version: schema.agentConfig.version,
    })
    .from(schema.agentConfig)
    .innerJoin(
      schema.publisher,
      eq(schema.agentConfig.publisher_id, schema.publisher.id)
    )
    .where(
      and(
        eq(schema.publisher.id, params.id),
        eq(schema.agentConfig.id, params.agentId),
        eq(schema.agentConfig.version, params.version)
      )
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
  const agentName = agentData.name || params.agentId

  return {
    title: `${agentName} v${agent[0].version} - Agent Details`,
    description:
      agentData.description ||
      `View details for ${agentName} version ${agent[0].version}`,
  }
}

const AgentDetailPage = async ({ params }: AgentDetailPageProps) => {
  // Get publisher info
  const publisher = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.id, params.id))
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
        eq(schema.agentConfig.publisher_id, params.id),
        eq(schema.agentConfig.id, params.agentId),
        eq(schema.agentConfig.version, params.version)
      )
    )
    .limit(1)

  if (agent.length === 0) {
    notFound()
  }

  const agentData =
    typeof agent[0].data === 'string'
      ? JSON.parse(agent[0].data)
      : agent[0].data
  const agentName = agentData.name || params.agentId

  // Get all versions of this agent for navigation
  const allVersions = await db
    .select({
      version: schema.agentConfig.version,
      created_at: schema.agentConfig.created_at,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.publisher_id, params.id),
        eq(schema.agentConfig.id, params.agentId)
      )
    )
    .orderBy(schema.agentConfig.created_at)

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-6">
          <Link href={`/publishers/${params.id}`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {publisherData.name}
            </Button>
          </Link>
        </div>

        {/* Agent Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <CardTitle className="text-2xl">{agentName}</CardTitle>
                  <Badge variant="outline" className="text-sm">
                    v{params.version}
                  </Badge>
                </div>
                <p className="text-muted-foreground mb-2">
                  by @{publisherData.id}
                </p>
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
                        }
                      )}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Code className="h-4 w-4" />
                    <span>Agent ID: {params.agentId}</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
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
                <div className="space-y-1">
                  {allVersions
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                    )
                    .map((version, index) => (
                      <Link
                        key={version.version}
                        href={`/publishers/${params.id}/agents/${params.agentId}/${version.version}`}
                      >
                        <Button
                          variant={
                            version.version === params.version
                              ? 'default'
                              : 'ghost'
                          }
                          size="sm"
                          className="w-full justify-start group transition-colors"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-mono">
                              v{version.version}
                            </span>
                            {index === 0 && (
                              <Badge
                                className={cn(
                                  'text-xs px-1.5 py-0 border',
                                  version.version === params.version
                                    ? 'bg-background text-foreground border-background'
                                    : 'bg-foreground text-background border-foreground'
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

          {/* Agent Configuration */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Agent Configuration</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Complete agent data in JSON format
                </p>
              </CardHeader>
              <CardContent>
                <JsonViewer data={agentData} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentDetailPage
