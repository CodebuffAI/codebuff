'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { RepositoryManagement } from '@/components/organization/repository-management'
import { useOrganizationData } from '@/hooks/use-organization-data'

export default function RepositoriesPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.slug as string

  // Use the custom hook for organization data
  const { organization, isLoading, error } = useOrganizationData(orgSlug)

  if (status === 'loading' || isLoading) {
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
              <Button onClick={() => window.location.reload()}>
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
          <Link href={`/orgs/${orgSlug}`}>
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
          organizationId={organization.id}
          userRole={organization.userRole}
        />
      </div>
    </div>
  )
}
