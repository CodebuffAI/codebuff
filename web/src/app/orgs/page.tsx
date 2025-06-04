'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, CreditCard, Settings, Building2 } from 'lucide-react'
import Link from 'next/link'
import { pluralize } from 'common/src/util/string'

interface Organization {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
  memberCount: number
  repositoryCount: number
}

const OrganizationsPage = () => {
  const { data: session, status } = useSession()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'authenticated') {
      fetchOrganizations()
    }
  }, [status])

  const fetchOrganizations = async () => {
    try {
      const response = await fetch('/api/orgs')
      if (response.ok) {
        const data = await response.json()
        setOrganizations(data.organizations || [])
      }
    } catch (error) {
      console.error('Error fetching organizations:', error)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-gray-200 rounded"></div>
              ))}
            </div>
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
                Please sign in to manage your organizations.
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

  return (
    <div className="container mx-auto py-4 sm:py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Organizations</h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Manage your organizations and team billing
            </p>
          </div>
          {!loading && organizations.length > 0 && (
            <Link href="/orgs/new" className="w-full sm:w-auto sm:self-end">
              <Button className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </Button>
            </Link>
          )}
        </div>

        {/* Organizations Grid */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
                  <div className="h-5 sm:h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 sm:h-4 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent className="px-4 pb-3 sm:px-6 sm:pb-4">
                  <div className="space-y-2">
                    <div className="h-3 sm:h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 sm:h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : organizations.length > 0 ? (
            // Display organizations
            organizations.map((org) => (
              <Link key={org.id} href={`/orgs/${org.slug}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center min-w-0 flex-1">
                        <Building2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                        <span className="truncate text-sm sm:text-base">{org.name}</span>
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">{org.role}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 sm:px-6 sm:pb-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-0 text-xs sm:text-sm text-muted-foreground">
                      <span className="flex items-center">
                        <Users className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                        {pluralize(org.memberCount, 'member')}
                      </span>
                      <span className="flex items-center">
                        <CreditCard className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                        {pluralize(org.repositoryCount, 'repo')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            // Empty state with integrated features
            <Card className="border-dashed border-2 border-gray-300 hover:border-gray-400 transition-colors col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
                <Users className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400 mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">
                  No Organization Yet
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl mx-auto mb-6 pt-4">
                  <div>
                    <h4 className="font-semibold mb-3 text-sm sm:text-base">
                      What are Organizations?
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                      Share billing and manage repository access across your
                      team. Credits are consumed from the organization's balance
                      instead of your personal account.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-sm sm:text-base">Key Features:</h4>
                    <ul className="text-xs sm:text-sm text-muted-foreground space-y-2">
                      <li className="flex items-center">
                        <CreditCard className="mr-2 h-3 w-3 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                        <span>Shared credit pools for team projects</span>
                      </li>
                      <li className="flex items-center">
                        <Building2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                        <span>Repository-based billing delegation</span>
                      </li>
                      <li className="flex items-center">
                        <Users className="mr-2 h-3 w-3 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                        <span>Member management and permissions</span>
                      </li>
                      <li className="flex items-center">
                        <Settings className="mr-2 h-3 w-3 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                        <span>Usage tracking and analytics</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <Link href="/orgs/new" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Organization
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default OrganizationsPage
