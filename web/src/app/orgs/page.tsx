'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, CreditCard, Settings, Building2 } from 'lucide-react'
import Link from 'next/link'

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
              <p className="mb-4">Please sign in to manage your organizations.</p>
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
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Organizations</h1>
            <p className="text-muted-foreground mt-2">
              Manage your organizations and team billing
            </p>
          </div>
          <Link href="/orgs/new" className="sm:flex-shrink-0">
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </Button>
          </Link>
        </div>

        {/* Organizations Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : organizations.length > 0 ? (
            // Display organizations
            organizations.map((org) => (
              <Link key={org.id} href={`/orgs/${org.slug}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        <Building2 className="mr-2 h-5 w-5 text-blue-600" />
                        {org.name}
                      </CardTitle>
                      <Badge variant="secondary">{org.role}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span className="flex items-center">
                        <Users className="mr-1 h-4 w-4" />
                        {org.memberCount} members
                      </span>
                      <span className="flex items-center">
                        <CreditCard className="mr-1 h-4 w-4" />
                        {org.repositoryCount} repos
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            // Empty state
            <Card className="border-dashed border-2 border-gray-300 hover:border-gray-400 transition-colors">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Organizations Yet</h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Create your first organization to start managing team billing and repositories.
                </p>
                <Link href="/orgs/new">
                  <Button variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Organization
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="mr-2 h-5 w-5" />
                Organization Billing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Organizations allow you to manage billing and repository access for your team. 
                  When you work on repositories associated with an organization, credits will be 
                  consumed from the organization's balance instead of your personal credits.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="font-semibold">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Shared credit pools for team projects</li>
                      <li>• Repository-based billing delegation</li>
                      <li>• Member management and permissions</li>
                      <li>• Usage tracking and analytics</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">Getting Started:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Create an organization</li>
                      <li>• Add team members</li>
                      <li>• Associate repositories</li>
                      <li>• Purchase organization credits</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default OrganizationsPage
