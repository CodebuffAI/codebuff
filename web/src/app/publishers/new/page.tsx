'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, User, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'

const CreatePublisherPage = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    email: '',
    bio: '',
    avatar_url: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false)

  const validateName = (name: string) => {
    if (!name.trim()) {
      return 'Publisher name is required'
    }

    if (name.length < 2) {
      return 'Publisher name must be at least 2 characters long'
    }

    if (name.length > 50) {
      return 'Publisher name must be no more than 50 characters long'
    }

    return ''
  }

  const validateId = (id: string) => {
    if (!id.trim()) {
      return 'Publisher ID is required'
    }

    if (id.length < 3) {
      return 'Publisher ID must be at least 3 characters long'
    }

    if (id.length > 30) {
      return 'Publisher ID must be no more than 30 characters long'
    }

    const validIdRegex = /^[a-z0-9-]+$/
    if (!validIdRegex.test(id)) {
      return 'Publisher ID can only contain lowercase letters, numbers, and hyphens'
    }

    if (id.startsWith('-') || id.endsWith('-')) {
      return 'Publisher ID cannot start or end with a hyphen'
    }

    return ''
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setFormData({ ...formData, name: newName })
    
    // Auto-generate ID from name if ID hasn't been manually edited
    if (!isIdManuallyEdited) {
      const autoId = newName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      setFormData(prev => ({ ...prev, name: newName, id: autoId }))
    } else {
      setFormData(prev => ({ ...prev, name: newName }))
    }
    
    const nameError = validateName(newName)
    setErrors(prev => ({ ...prev, name: nameError }))
  }

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value.toLowerCase()
    setFormData({ ...formData, id: newId })
    setIsIdManuallyEdited(true)
    
    const idError = validateId(newId)
    setErrors(prev => ({ ...prev, id: idError }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const nameError = validateName(formData.name)
    const idError = validateId(formData.id)
    
    if (nameError || idError) {
      setErrors({ name: nameError, id: idError })
      toast({
        title: 'Error',
        description: 'Please fix the validation errors',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: formData.id,
          name: formData.name,
          email: formData.email || undefined,
          bio: formData.bio || undefined,
          avatar_url: formData.avatar_url || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create publisher profile')
      }

      const publisher = await response.json()
      
      toast({
        title: 'Success',
        description: 'Publisher profile created successfully!',
      })
      
      // Redirect to publisher profile
      router.push(`/publishers/${publisher.id}`)
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to create publisher profile',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
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
              <p className="mb-4">Please sign in to create a publisher profile.</p>
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
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="mr-2 h-5 w-5" />
              Create Publisher Profile
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Create your public publisher profile to publish agents on the Codebuff store.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Publisher Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="Enter your publisher name"
                  required
                  disabled={isLoading}
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  This will be displayed publicly on your published agents.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="id">
                  Publisher ID <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="id"
                  type="text"
                  value={formData.id}
                  onChange={handleIdChange}
                  placeholder="your-publisher-id"
                  required
                  disabled={isLoading}
                  className={errors.id ? 'border-red-500' : ''}
                />
                {errors.id && (
                  <p className="text-sm text-red-600">{errors.id}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  This will be your unique URL: codebuff.com/publishers/{formData.id || 'your-id'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Contact Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@example.com"
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground">
                  Optional. For users to contact you about your agents.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell users about yourself and your agents..."
                  rows={4}
                  disabled={isLoading}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar_url">Avatar URL</Label>
                <Input
                  id="avatar_url"
                  type="url"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground">
                  Optional. URL to your profile picture or logo.
                </p>
              </div>

              <div className="border-t pt-6">
                <div className="flex justify-end space-x-4">
                  <Link href="/">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={isLoading || !!errors.name || !!errors.id}>
                    {isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Publisher Profile
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default CreatePublisherPage
