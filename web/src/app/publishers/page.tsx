'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { User, Plus, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { pluralize } from '@codebuff/common/util/string'
import type { PublisherProfileResponse } from '@codebuff/common/types/publisher'

const PublishersPage = () => {
  const { data: session, status } = useSession()

  // Query for user's publishers
  const {
    data: publishers = [],
    isLoading,
    error,
  } = useQuery<PublisherProfileResponse[]>({
    queryKey: ['user-publishers'],
    queryFn: async (): Promise<PublisherProfileResponse[]> => {
      const response = await fetch('/api/publishers')
      if (!response.ok) {
        throw new Error('Failed to load publishers')
      }
      return response.json()
    },
    enabled: !!session?.user?.id,
  })

  const personalPublishers = publishers.filter(
    (p) => p.ownershipType === 'user',
  )
  const orgPublishers = publishers.filter(
    (p) => p.ownershipType === 'organization',
  )

  if (status === 'loading') {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Sign in Required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                Please sign in to view your publisher profiles.
              </p>
              <Link href="/login">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-red-500">
            Failed to load publishers. Please try again later.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="flex items-center">
            <User className="h-8 w-8 text-blue-600 mr-3 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold">My Publishers</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage your publisher profiles and published agents
              </p>
            </div>
          </div>
          <Link href="/publishers/new" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto flex items-center justify-center">
              <Plus className="mr-2 h-4 w-4" />
              Create Publisher
            </Button>
          </Link>
        </div>

        {/* Organization Guidance Banner */}
        {publishers.length === 0 && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="py-4">
              <div className="flex items-start">
                <User className="mr-3 h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-800 mb-1">
                    New to Publishers?
                  </h3>
                  <p className="text-sm text-blue-700 mb-3">
                    Most users create publishers through their organizations for
                    better team collaboration and credit management.
                  </p>
                  <Link href="/orgs">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <User className="mr-2 h-4 w-4" />
                      View Organizations
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {/* Personal Publishers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Personal Publishers</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : personalPublishers.length === 0 ? (
                <div className="text-center py-8 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-4">
                    No personal publisher profiles yet.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Link href="/publishers/new">
                      <Button variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Create Personal Publisher
                      </Button>
                    </Link>
                    <Link href="/orgs">
                      <Button variant="outline">
                        <User className="mr-2 h-4 w-4" />
                        Manage via Organizations
                      </Button>
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Tip: Create publishers through organizations for team
                    collaboration
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {personalPublishers.map((publisher) => (
                    <Link
                      key={publisher.id}
                      href={`/publishers/${publisher.id}`}
                      className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold">{publisher.name}</h3>
                            {publisher.verified && (
                              <Badge
                                variant="secondary"
                                className="text-green-600"
                              >
                                ✓ Verified
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            @{publisher.id}
                          </p>
                          {publisher.bio && (
                            <p className="text-sm mb-2">{publisher.bio}</p>
                          )}
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span>
                              {pluralize(publisher.agentCount || 0, 'agent')}{' '}
                              published
                            </span>
                            <span>
                              Created{' '}
                              {new Date(
                                publisher.created_at,
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Organization Publishers */}
          {orgPublishers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Organization Publishers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {orgPublishers.map((publisher) => (
                    <Link
                      key={publisher.id}
                      href={`/publishers/${publisher.id}`}
                      className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold">{publisher.name}</h3>
                            {publisher.verified && (
                              <Badge
                                variant="secondary"
                                className="text-green-600"
                              >
                                ✓ Verified
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {publisher.organizationName}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            @{publisher.id}
                          </p>
                          {publisher.bio && (
                            <p className="text-sm mb-2">{publisher.bio}</p>
                          )}
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span>
                              {pluralize(publisher.agentCount || 0, 'agent')}{' '}
                              published
                            </span>
                            <span>
                              Created{' '}
                              {new Date(
                                publisher.created_at,
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default PublishersPage
