'use client'

import { ArrowLeft, Settings, Trash2, AlertTriangle, User } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

import { BillingStatus } from '@/components/organization/billing-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmationInputDialog } from '@/components/ui/confirmation-input-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { useOrganizationData } from '@/hooks/use-organization-data'
import type { PublisherProfileResponse } from '@codebuff/common/types/publisher'

export default function OrganizationSettingsPage() {
  const { data: session, status } = useSession()
  const params = useParams() ?? {}
  const router = useRouter()
  const orgSlug = (params.slug as string) ?? ''

  const [updateForm, setUpdateForm] = useState({
    name: '',
    description: '',
  })
  const [updating, setUpdating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [publishers, setPublishers] = useState<PublisherProfileResponse[]>([])
  const [publishersLoading, setPublishersLoading] = useState(true)

  // Use the custom hook for organization data
  const { organization, isLoading, error } = useOrganizationData(orgSlug)

  // Fetch publishers data for this organization
  useEffect(() => {
    const fetchPublishers = async () => {
      if (!organization?.id) return

      setPublishersLoading(true)
      try {
        const response = await fetch(`/api/orgs/${organization.id}/publishers`)
        if (response.ok) {
          const data = await response.json()
          setPublishers(data.publishers || [])
        }
      } catch (error) {
        console.error('Error fetching publishers:', error)
      } finally {
        setPublishersLoading(false)
      }
    }

    fetchPublishers()
  }, [organization?.id])

  // Initialize form when organization data loads
  useEffect(() => {
    if (organization) {
      setUpdateForm({
        name: organization.name,
        description: organization.description || '',
      })
    }
  }, [organization])

  const handleUpdateOrganization = async () => {
    if (!organization) return

    if (!updateForm.name.trim()) {
      toast({
        title: 'Error',
        description: 'Organization name is required',
        variant: 'destructive',
      })
      return
    }

    setUpdating(true)
    try {
      const response = await fetch(`/api/orgs/${organization.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateForm),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update organization')
      }

      toast({
        title: 'Success',
        description: 'Organization updated successfully',
      })

      // Refresh the page to show updated data
      window.location.reload()
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to update organization',
        variant: 'destructive',
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteOrganization = () => {
    setDeleteDialogOpen(true)
  }

  const confirmDeleteOrganization = async () => {
    if (!organization) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/orgs/${organization.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete organization')
      }

      toast({
        title: 'Success',
        description: 'Organization deleted successfully',
      })

      // Navigate back to organizations list
      router.push('/orgs')
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to delete organization',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  if (status === 'loading' || isLoading) {
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
                Please sign in to manage organization settings.
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
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-red-600">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">{error}</p>
              <div className="flex gap-2">
                <Button onClick={() => router.back()} variant="outline">
                  Go Back
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!organization) {
    return null
  }

  const canManageOrg =
    organization.userRole === 'owner' || organization.userRole === 'admin'
  const canDeleteOrg = organization.userRole === 'owner'

  if (!canManageOrg) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                You don't have permission to manage this organization's
                settings.
              </p>
              <Link href={`/orgs/${orgSlug}`}>
                <Button>Back to Organization</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Link href={`/orgs/${orgSlug}`}>
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Organization
            </Button>
          </Link>
        </div>

        <div className="flex items-center mb-8">
          <Settings className="h-8 w-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-3xl font-bold">Organization Settings</h1>
            <p className="text-muted-foreground">
              Manage your organization's details and preferences
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Billing & Seats */}
          {canManageOrg && organization && (
            <BillingStatus organizationId={organization.id} />
          )}

          {/* Publisher Management */}
          {canManageOrg && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-5 w-5" />
                  Publisher Profiles
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Manage publisher profiles for this organization to publish and
                  distribute agents
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {publishersLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-10 w-40" />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">
                        Organization Publishers ({publishers.length})
                      </h4>
                      <Link
                        href={`/publishers/new?org=${organization.id}&type=organization`}
                      >
                        <Button className="flex items-center">
                          <User className="mr-2 h-4 w-4" />
                          Create Publisher Profile
                        </Button>
                      </Link>
                    </div>

                    {publishers.length === 0 ? (
                      <div className="text-center py-8 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-4">
                          No publisher profiles created yet.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Create a publisher profile to start publishing agents
                          for this organization.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {publishers.map((publisher) => (
                          <div
                            key={publisher.id}
                            className="bg-muted/50 rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <h5 className="font-medium">
                                    {publisher.name}
                                  </h5>
                                  {publisher.verified && (
                                    <span className="text-green-600 text-sm">
                                      ✓ Verified
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  @{publisher.id}
                                </p>
                                {publisher.bio && (
                                  <p className="text-sm mb-2">
                                    {publisher.bio}
                                  </p>
                                )}
                                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                  <span>
                                    {publisher.agentCount || 0} agents published
                                  </span>
                                  <span>
                                    Created{' '}
                                    {new Date(
                                      publisher.created_at,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              <Link href={`/publishers/${publisher.id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex items-center"
                                >
                                  <User className="mr-2 h-4 w-4" />
                                  View Profile
                                </Button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  value={updateForm.name}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, name: e.target.value })
                  }
                  placeholder="Enter organization name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={updateForm.description}
                  onChange={(e) =>
                    setUpdateForm({
                      ...updateForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Enter organization description (optional)"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Organization Slug</Label>
                <Input
                  value={organization.slug}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  The organization slug cannot be changed after creation
                </p>
              </div>
              <Button onClick={handleUpdateOrganization} disabled={updating}>
                {updating ? 'Updating...' : 'Update Organization'}
              </Button>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          {canDeleteOrg && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Delete Organization</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete this organization and all associated
                    data. This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteOrganization}
                    className="flex items-center"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Organization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmationInputDialog
          isOpen={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Organization"
          description={
            <div className="space-y-4">
              <p>
                This action cannot be undone. This will permanently delete the
                organization and all associated data.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• All organization data and settings</li>
                  <li>• Team member associations</li>
                  <li>• Repository associations</li>
                  <li>• Credit balances and usage history</li>
                  <li>• Billing information and invoices</li>
                </ul>
              </div>
            </div>
          }
          confirmationText={organization.slug}
          onConfirm={confirmDeleteOrganization}
          isConfirming={deleting}
          confirmButtonText="Delete Organization"
        />
      </div>
    </div>
  )
}
