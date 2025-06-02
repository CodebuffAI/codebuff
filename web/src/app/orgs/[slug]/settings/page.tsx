'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Settings,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'
import { useOrganizationData } from '@/hooks/use-organization-data'

export default function OrganizationSettingsPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.slug as string

  const [updateForm, setUpdateForm] = useState({
    name: '',
    description: '',
  })
  const [updating, setUpdating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Use the custom hook for organization data
  const { organization, isLoading, error } = useOrganizationData(orgSlug)

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
          error instanceof Error ? error.message : 'Failed to update organization',
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

    if (deleteConfirmSlug !== organization.slug) {
      toast({
        title: 'Error',
        description: 'Please type the organization slug exactly as shown',
        variant: 'destructive',
      })
      return
    }

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
          error instanceof Error ? error.message : 'Failed to delete organization',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setDeleteConfirmSlug('')
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
              <p className="mb-4">Please sign in to manage organization settings.</p>
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

  const canManageOrg = organization.userRole === 'owner' || organization.userRole === 'admin'
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
              <p className="mb-4">You don't have permission to manage this organization's settings.</p>
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
                  onChange={(e) => setUpdateForm({ ...updateForm, name: e.target.value })}
                  placeholder="Enter organization name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={updateForm.description}
                  onChange={(e) => setUpdateForm({ ...updateForm, description: e.target.value })}
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
                    Permanently delete this organization and all associated data. This action cannot be undone.
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
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center text-red-600">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Delete Organization
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the organization and all associated data.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">
                  Type <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{organization.slug}</code> to confirm:
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmSlug}
                  onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                  placeholder={organization.slug}
                  className="font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={confirmDeleteOrganization}
                disabled={deleting || deleteConfirmSlug !== organization.slug}
                className="w-full"
              >
                {deleting ? 'Deleting...' : 'Delete Organization'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
