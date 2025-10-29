'use client'

import { pluralize } from '@codebuff/common/util/string'
import {
  GitBranch,
  Plus,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Github,
  AlertTriangle,
  PauseCircle,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useDebouncedCallback } from 'use-debounce'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'

interface Repository {
  id: string
  repository_url: string
  repository_name: string
  approved_by: string
  approved_at: string
  is_active: boolean
  approver: {
    name: string
    email: string
  }
}

interface RepositoryManagementProps {
  organizationId: string
  userRole: 'owner' | 'admin' | 'member'
  noCardWrapper?: boolean
}

// Helper function to extract repository name from URL
function extractRepoNameFromUrl(url: string): string {
  try {
    // Handle empty or invalid URLs
    if (!url.trim()) return ''

    // Normalize the URL - add https:// if missing
    let normalizedUrl = url.trim()
    if (
      !normalizedUrl.startsWith('http://') &&
      !normalizedUrl.startsWith('https://')
    ) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    const urlObj = new URL(normalizedUrl)
    const pathname = urlObj.pathname

    // Split the pathname and get segments
    const pathSegments = pathname
      .split('/')
      .filter((segment) => segment.length > 0)

    if (pathSegments.length === 0) return ''

    // Handle GitHub URLs specifically
    if (urlObj.hostname === 'github.com') {
      // GitHub URLs follow the pattern: github.com/owner/repo
      if (pathSegments.length >= 2) {
        let repo = pathSegments[1]

        // Remove .git suffix if present
        if (repo.endsWith('.git')) {
          repo = repo.slice(0, -4)
        }

        return repo
      }
    }

    // For non-GitHub URLs, use the last segment as before
    let repoName = pathSegments[pathSegments.length - 1]

    // Remove .git suffix if present
    if (repoName.endsWith('.git')) {
      repoName = repoName.slice(0, -4)
    }

    return repoName
  } catch (error) {
    // If URL parsing fails, try to extract from the end of the string
    const segments = url.split('/').filter((segment) => segment.length > 0)
    if (segments.length > 0) {
      let lastSegment = segments[segments.length - 1]
      if (lastSegment.endsWith('.git')) {
        lastSegment = lastSegment.slice(0, -4)
      }
      return lastSegment
    }
    return ''
  }
}

export function RepositoryManagement({
  organizationId,
  userRole,
  noCardWrapper,
}: RepositoryManagementProps) {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false)
  const [repoToRemove, setRepoToRemove] = useState<{
    id: string
    name: string
  } | null>(null)
  const [repoToDeactivate, setRepoToDeactivate] = useState<{
    id: string
    name: string
  } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [activating, setActivating] = useState<string | null>(null) // Track which repo is being activated
  const [addForm, setAddForm] = useState({
    repository_url: '',
    repository_name: '',
  })
  const [adding, setAdding] = useState(false)
  const isMobile = useIsMobile()

  const canManageRepos = userRole === 'owner' || userRole === 'admin'

  // Create a debounced version of the auto-fill logic using use-debounce
  const debouncedAutoFill = useDebouncedCallback((url: string) => {
    setAddForm((prev) => {
      // If URL is empty, clear the repository name
      if (!url.trim()) {
        return { ...prev, repository_name: '' }
      }

      // Always auto-fill when URL changes (removed the empty name check)
      if (url.trim()) {
        const extractedName = extractRepoNameFromUrl(url)
        if (extractedName) {
          return { ...prev, repository_name: extractedName }
        }
      }
      return prev
    })
  }, 500) // 500ms delay

  useEffect(() => {
    fetchRepositories()
  }, [organizationId])

  const fetchRepositories = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/orgs/${organizationId}/repos`)

      if (response.ok) {
        const data = await response.json()
        setRepositories(data.repositories || [])
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to load repositories',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error fetching repositories:', error)
      toast({
        title: 'Error',
        description: 'Failed to load repositories',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUrlChange = (url: string) => {
    setAddForm((prev) => ({ ...prev, repository_url: url }))
    // Trigger debounced auto-fill
    debouncedAutoFill(url)
  }

  const handleAddRepository = async () => {
    if (!addForm.repository_url.trim()) {
      toast({
        title: 'Error',
        description: 'Repository URL is required',
        variant: 'destructive',
      })
      return
    }

    if (!addForm.repository_name.trim()) {
      toast({
        title: 'Error',
        description: 'Repository name is required',
        variant: 'destructive',
      })
      return
    }

    setAdding(true)
    try {
      const response = await fetch(`/api/orgs/${organizationId}/repos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addForm),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add repository')
      }

      toast({
        title: 'Success',
        description: `Repository "${addForm.repository_name}" added successfully`,
      })

      setAddDialogOpen(false)
      setAddForm({ repository_url: '', repository_name: '' })
      fetchRepositories() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to add repository',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveRepository = (repoId: string, repoName: string) => {
    setRepoToRemove({ id: repoId, name: repoName })
    setRemoveConfirmOpen(true)
  }

  const handleToggleRepository = (repo: Repository) => {
    if (repo.is_active) {
      // Deactivating - show confirmation modal
      setRepoToDeactivate({ id: repo.id, name: repo.repository_name })
      setDeactivateConfirmOpen(true)
    } else {
      // Activating - do it directly
      activateRepository(repo.id, repo.repository_name)
    }
  }

  const activateRepository = async (repoId: string, repoName: string) => {
    setActivating(repoId)
    try {
      const response = await fetch(
        `/api/orgs/${organizationId}/repos/${repoId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isActive: true }),
        },
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to activate repository')
      }

      toast({
        title: 'Success',
        description: `Repository "${repoName}" has been activated`,
      })

      fetchRepositories() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to activate repository',
        variant: 'destructive',
      })
    } finally {
      setActivating(null)
    }
  }

  const confirmRemoveRepository = async () => {
    if (!repoToRemove) return

    setRemoving(true)
    try {
      const response = await fetch(
        `/api/orgs/${organizationId}/repos/${repoToRemove.id}`,
        {
          method: 'DELETE',
        },
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove repository')
      }

      toast({
        title: 'Success',
        description: `Repository "${repoToRemove.name}" has been permanently removed from the organization`,
      })

      setRemoveConfirmOpen(false)
      setRepoToRemove(null)
      fetchRepositories() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to remove repository',
        variant: 'destructive',
      })
    } finally {
      setRemoving(false)
    }
  }

  const confirmDeactivateRepository = async () => {
    if (!repoToDeactivate) return

    setDeactivating(true)
    try {
      const response = await fetch(
        `/api/orgs/${organizationId}/repos/${repoToDeactivate.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isActive: false }),
        },
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to deactivate repository')
      }

      toast({
        title: 'Success',
        description: `Repository "${repoToDeactivate.name}" has been deactivated`,
      })

      setDeactivateConfirmOpen(false)
      setRepoToDeactivate(null)
      fetchRepositories() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to deactivate repository',
        variant: 'destructive',
      })
    } finally {
      setDeactivating(false)
    }
  }

  const getRepositoryIcon = (url: string) => {
    if (url.includes('github.com')) {
      return <Github className="h-4 w-4" />
    } else if (url.includes('gitlab.com')) {
      return <GitBranch className="h-4 w-4 text-orange-600" />
    }
    return <GitBranch className="h-4 w-4" />
  }

  const getRepositoryDomain = (url: string) => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return 'Unknown'
    }
  }

  if (loading) {
    return (
      <Card
        className={
          noCardWrapper ? 'border-none shadow-none bg-transparent' : ''
        }
      >
        <CardHeader className={noCardWrapper ? 'p-0' : ''}>
          <CardTitle className="flex items-center text-base sm:text-lg">
            <GitBranch className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Repository Management
          </CardTitle>
        </CardHeader>
        <CardContent className={noCardWrapper ? 'p-0' : ''}>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 sm:p-4 border rounded-lg"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 sm:w-48"></div>
                  <div className="h-3 bg-gray-200 rounded w-24 sm:w-32"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-12 sm:w-16"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card
        className={
          noCardWrapper
            ? 'w-full border-none shadow-none bg-transparent'
            : 'w-full'
        }
      >
        <CardHeader className={noCardWrapper ? 'p-0' : ''}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center text-base sm:text-lg">
              <GitBranch className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              {pluralize(repositories.length, 'Repository')}
            </CardTitle>
            {canManageRepos && repositories.length > 0 && (
              <Button
                onClick={() => setAddDialogOpen(true)}
                size={isMobile ? 'sm' : 'default'}
                className="w-full sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                {isMobile ? 'Add Repo' : 'Add Repository'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className={noCardWrapper ? 'p-0' : ''}>
          <div className="space-y-3 sm:space-y-4">
            {repositories.map((repo) => (
              <div
                key={repo.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg"
              >
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    {getRepositoryIcon(repo.repository_url)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm sm:text-base truncate">
                      {repo.repository_name}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground flex items-center">
                      <span className="truncate">
                        {getRepositoryDomain(repo.repository_url)}
                      </span>
                      <a
                        href={repo.repository_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 hover:text-blue-800 flex-shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Added by {repo.approver.name} •{' '}
                      {new Date(repo.approved_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end space-x-3 flex-shrink-0">
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={repo.is_active ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {repo.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {canManageRepos && (
                      <Switch
                        checked={repo.is_active}
                        onCheckedChange={() => handleToggleRepository(repo)}
                        disabled={activating === repo.id || deactivating}
                        aria-label={`${repo.is_active ? 'Deactivate' : 'Activate'} ${repo.repository_name}`}
                      />
                    )}
                  </div>
                  {canManageRepos && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={isMobile ? 'h-10 w-10 p-0' : 'h-8 w-8 p-0'}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align={isMobile ? 'center' : 'end'}
                        className={isMobile ? 'w-56' : ''}
                      >
                        <DropdownMenuItem
                          onClick={() =>
                            handleRemoveRepository(
                              repo.id,
                              repo.repository_name,
                            )
                          }
                          className={
                            isMobile
                              ? 'text-red-600 text-sm py-3'
                              : 'text-red-600 text-sm'
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove Repository
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
            {repositories.length === 0 && (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <GitBranch className="mx-auto h-8 w-8 sm:h-12 sm:w-12 mb-4 opacity-50" />
                <p className="text-base sm:text-lg font-medium mb-2">
                  No repositories yet
                </p>
                <p className="mb-4 text-sm sm:text-base">
                  Add repositories to enable credit delegation for your
                  organization.
                </p>
                {canManageRepos && (
                  <Button
                    onClick={() => setAddDialogOpen(true)}
                    size={isMobile ? 'sm' : 'default'}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Repository
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Repository Dialog */}
      {canManageRepos && (
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="w-[95vw] max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">
                Add Repository
              </DialogTitle>
              <DialogDescription className="text-sm">
                Add a repository to this organization for credit delegation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repository_url" className="text-sm">
                  Repository URL
                </Label>
                <Input
                  id="repository_url"
                  type="url"
                  placeholder="https://github.com/username/repository"
                  value={addForm.repository_url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={adding}
                className="w-full sm:w-auto"
                size={isMobile ? 'sm' : 'default'}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddRepository}
                disabled={adding}
                className="w-full sm:w-auto"
                size={isMobile ? 'sm' : 'default'}
              >
                {adding ? 'Adding...' : 'Add Repository'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Deactivate Repository Confirmation Dialog */}
      <Dialog
        open={deactivateConfirmOpen}
        onOpenChange={setDeactivateConfirmOpen}
      >
        <DialogContent className="w-[95vw] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center text-orange-600">
              <PauseCircle className="mr-2 h-5 w-5" />
              Deactivate Repository
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate this repository?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-800">
                <strong>Repository:</strong> {repoToDeactivate?.name}
              </p>
              <p className="text-sm text-orange-700 mt-2">
                This action will disable credit delegation for this repository.
                The repository will remain in your organization but will be
                marked as inactive. You can reactivate it later using the toggle
                switch.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeactivateConfirmOpen(false)
                setRepoToDeactivate(null)
              }}
              disabled={deactivating}
              className="w-full sm:w-auto"
              size={isMobile ? 'sm' : 'default'}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeactivateRepository}
              disabled={deactivating}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
              size={isMobile ? 'sm' : 'default'}
            >
              {deactivating ? 'Deactivating...' : 'Deactivate Repository'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Repository Confirmation Dialog */}
      <Dialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <DialogContent className="w-[95vw] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Remove Repository
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently remove this repository from
              the organization?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                <strong>Repository:</strong> {repoToRemove?.name}
              </p>
              <p className="text-sm text-red-700 mt-2">
                This action will permanently delete the repository from the
                organization. All associated data and credit delegation history
                will be lost. This action cannot be undone.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRemoveConfirmOpen(false)
                setRepoToRemove(null)
              }}
              disabled={removing}
              className="w-full sm:w-auto"
              size={isMobile ? 'sm' : 'default'}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveRepository}
              disabled={removing}
              className="w-full sm:w-auto"
              size={isMobile ? 'sm' : 'default'}
            >
              {removing ? 'Removing...' : 'Remove Repository'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
