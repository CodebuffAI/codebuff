'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  GitBranch, 
  Plus, 
  MoreHorizontal, 
  Trash2, 
  ExternalLink,
  Github
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

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
}

export function RepositoryManagement({ organizationId, userRole }: RepositoryManagementProps) {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    repository_url: '',
    repository_name: ''
  })
  const [adding, setAdding] = useState(false)

  const canManageRepos = userRole === 'owner' || userRole === 'admin'

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
        description: error instanceof Error ? error.message : 'Failed to add repository',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveRepository = async (repoId: string, repoName: string) => {
    if (!confirm(`Are you sure you want to remove "${repoName}" from the organization?`)) {
      return
    }

    try {
      const response = await fetch(`/api/orgs/${organizationId}/repos/${repoId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove repository')
      }

      toast({
        title: 'Success',
        description: `Repository "${repoName}" has been removed from the organization`,
      })

      fetchRepositories() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove repository',
        variant: 'destructive',
      })
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GitBranch className="mr-2 h-5 w-5" />
            Repository Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-48"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <GitBranch className="mr-2 h-5 w-5" />
            Repositories ({repositories.length})
          </CardTitle>
          {canManageRepos && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Repository
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Repository</DialogTitle>
                  <DialogDescription>
                    Add a repository to this organization for credit delegation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="repository_url">Repository URL</Label>
                    <Input
                      id="repository_url"
                      type="url"
                      placeholder="https://github.com/username/repository"
                      value={addForm.repository_url}
                      onChange={(e) => setAddForm({ ...addForm, repository_url: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Supports GitHub, GitLab, and Bitbucket repositories
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repository_name">Repository Name</Label>
                    <Input
                      id="repository_name"
                      placeholder="My Project"
                      value={addForm.repository_name}
                      onChange={(e) => setAddForm({ ...addForm, repository_name: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                    disabled={adding}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddRepository} disabled={adding}>
                    {adding ? 'Adding...' : 'Add Repository'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {repositories.map((repo) => (
            <div key={repo.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  {getRepositoryIcon(repo.repository_url)}
                </div>
                <div>
                  <div className="font-medium">{repo.repository_name}</div>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <span>{getRepositoryDomain(repo.repository_url)}</span>
                    <a
                      href={repo.repository_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Added by {repo.approver.name} • {new Date(repo.approved_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant={repo.is_active ? 'default' : 'secondary'}>
                  {repo.is_active ? 'Active' : 'Inactive'}
                </Badge>
                {canManageRepos && repo.is_active && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleRemoveRepository(repo.id, repo.repository_name)}
                        className="text-red-600"
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
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No repositories yet</p>
              <p className="mb-4">Add repositories to enable credit delegation for your organization.</p>
              {canManageRepos && (
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Repository
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
