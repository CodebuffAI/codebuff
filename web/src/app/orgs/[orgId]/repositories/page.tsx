'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { RepositoryManagement } from '@/components/organization/repository-management'

interface OrganizationDetails {
  id: string
  name: string
  userRole: 'owner' | 'admin' | 'member'
}

export default function RepositoriesPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [organization, setOrganization] = useState<OrganizationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && orgId) {
      fetchOrganizationData()
    }
  }, [status, orgId])

  const fetchOrganizationData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/orgs/${orgId}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch organization')
      }

      const orgData = await response.json()
      setOrganization({
        id: orgData.id,
        name: orgData.name,
        userRole: orgData.userRole,
      })
    } catch (error) {
      console.error('Error fetching organization:', error)
      setError(error instanceof Error ? error.message : 'Failed to load organization')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="space-y-6">
              <div className="h-48 bg-gray-200 rounded"></div>
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
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Sign in Required</h1>
            <p className="mb-4">Please sign in to manage this organization's repositories.</p>
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (error || !organization) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Error</h1>
            <p className="mb-4">{error || 'Organization not found'}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => router.back()} variant="outline">
                Go Back
              </Button>
              <Button onClick={fetchOrganizationData}>
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Link href={`/orgs/${orgId}`}>
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {organization.name}
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Repository Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage repositories for credit delegation and usage tracking in {organization.name}
          </p>
        </div>

        {/* Repository Management Component */}
        <RepositoryManagement 
          organizationId={orgId} 
          userRole={organization.userRole}
        />
      </div>
    </div>
  )
}
