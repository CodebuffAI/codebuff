import { notFound } from 'next/navigation'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Mail, Calendar, CheckCircle } from 'lucide-react'
import Image from 'next/image'

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
    description: publisher[0].bio || `View ${publisher[0].name}'s published agents on Codebuff`,
  }
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
    .limit(10) // Show latest 10 agents

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-4xl mx-auto">
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
                  <CardTitle className="text-2xl">{publisherData.name}</CardTitle>
                  {publisherData.verified && (
                    <Badge variant="secondary" className="flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3" />
                      <span>Verified</span>
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-2">@{publisherData.id}</p>
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
                    <span>Joined {new Date(publisherData.created_at).toLocaleDateString()}</span>
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
              <div className="text-2xl font-bold">{agentCount}</div>
              <p className="text-sm text-muted-foreground">Published Agents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold">{publisherData.verified ? 'Verified' : 'Unverified'}</div>
              <p className="text-sm text-muted-foreground">Publisher Status</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold">
                {new Date(publisherData.created_at).getFullYear()}
              </div>
              <p className="text-sm text-muted-foreground">Member Since</p>
            </CardContent>
          </Card>
        </div>

        {/* Published Agents */}
        <Card>
          <CardHeader>
            <CardTitle>Published Agents</CardTitle>
          </CardHeader>
          <CardContent>
            {publishedAgents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No agents published yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {publishedAgents.map((agent) => {
                  // Parse the data JSON to get agent details
                  const agentData = typeof agent.data === 'string' 
                    ? JSON.parse(agent.data) 
                    : agent.data
                  
                  return (
                    <div key={`${agent.id}-${agent.version}`} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{agentData.name || agent.id}</h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            Version {agent.version}
                          </p>
                          {agentData.description && (
                            <p className="text-sm">{agentData.description}</p>
                          )}
                        </div>
                        <Badge variant="outline">
                          {new Date(agent.created_at).toLocaleDateString()}
                        </Badge>
                      </div>
                    </div>
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
