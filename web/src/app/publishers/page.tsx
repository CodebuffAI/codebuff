'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarUpload } from '@/components/ui/avatar-upload'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  User,
  Loader2,
  Building2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'

interface Organization {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
}

const CreatePublisherPage = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Step management
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 3

  // Initialize state from URL parameters
  const orgParam = searchParams.get('org')
  const typeParam = searchParams.get('type')
  const isOrgMode = typeParam === 'organization' && orgParam

  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    email: '',
    bio: '',
    avatar_url: '',
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false)
  const [hasRemovedAvatar, setHasRemovedAvatar] = useState(false)
  const [ownershipType, setOwnershipType] = useState<
    'personal' | 'organization'
  >(isOrgMode ? 'organization' : 'personal')
  const [selectedOrgId, setSelectedOrgId] = useState<string>(orgParam || '')

  // Clean up URL parameters after initialization
  useEffect(() => {
    if (isOrgMode) {
      const url = new URL(window.location.href)
      url.searchParams.delete('org')
      url.searchParams.delete('type')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])
  // Query for user's organizations
  const {
    data: organizations = [],
    isLoading: isLoadingOrgs,
    error: orgsError,
  } = useQuery<Organization[]>({
    queryKey: ['user-organizations'],
    queryFn: async (): Promise<Organization[]> => {
      const response = await fetch('/api/orgs')
      if (!response.ok) {
        throw new Error('Failed to load organizations')
      }
      const data: { organizations: Organization[] } = await response.json()
      if (data.organizations) {
        // Filter to only show orgs where user is owner or admin
        return data.organizations.filter(
          (org) => org.role === 'owner' || org.role === 'admin'
        )
      }
      return []
    },
    enabled: !!session?.user?.id,
  })

  // Default to user's existing avatar
  useEffect(() => {
    if (session?.user?.image && !formData.avatar_url && !hasRemovedAvatar) {
      setFormData((prev) => ({
        ...prev,
        avatar_url: session.user?.image || '',
      }))
    }
  }, [session?.user?.image, formData.avatar_url, hasRemovedAvatar])

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
      setFormData((prev) => ({ ...prev, name: newName, id: autoId }))
    } else {
      setFormData((prev) => ({ ...prev, name: newName }))
    }

    const nameError = validateName(newName)
    setErrors((prev) => ({ ...prev, name: nameError }))
  }

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value.toLowerCase()
    setFormData({ ...formData, id: newId })
    setIsIdManuallyEdited(true)
    const idError = validateId(newId)
    setErrors((prev) => ({ ...prev, id: idError }))
  }

  const handleAvatarChange = async (file: File | null, url: string) => {
    setAvatarFile(file)
    setFormData((prev) => ({ ...prev, avatar_url: url }))

    // Track if user explicitly removed the avatar
    if (!file && !url) {
      setHasRemovedAvatar(true)
    } else {
      setHasRemovedAvatar(false)
    }
  }

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return formData.avatar_url || null

    setIsUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('avatar', avatarFile)

      const response = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to upload avatar')
      }

      const { avatar_url } = await response.json()
      return avatar_url
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to upload avatar',
        variant: 'destructive',
      })
      return null
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSubmit = async () => {
    const nameError = validateName(formData.name)
    const idError = validateId(formData.id)
    let orgError = ''

    if (ownershipType === 'organization' && !selectedOrgId) {
      orgError = 'Please select an organization'
    }

    if (nameError || idError || orgError) {
      setErrors({ name: nameError, id: idError, organization: orgError })
      toast({
        title: 'Error',
        description: 'Please fix the validation errors',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      // Upload avatar first if there's a new file
      const avatarUrl = await uploadAvatar()

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
          avatar_url: avatarUrl || undefined,
          org_id: ownershipType === 'organization' ? selectedOrgId : undefined,
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

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (ownershipType === 'organization' && !selectedOrgId) {
        newErrors.organization = 'Please select an organization'
      }
    } else if (step === 2) {
      const nameError = validateName(formData.name)
      const idError = validateId(formData.id)
      if (nameError) newErrors.name = nameError
      if (idError) newErrors.id = idError
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      nextStep()
    } else {
      toast({
        title: 'Please fix the errors',
        description: 'Complete all required fields before continuing.',
        variant: 'destructive',
      })
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
              <p className="mb-4">
                Please sign in to create a publisher profile.
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

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <RadioGroup
          value={ownershipType}
          onValueChange={(value: 'personal' | 'organization') => {
            setOwnershipType(value)
            if (value === 'personal') {
              setSelectedOrgId('')
            }
          }}
          className="space-y-4"
        >
          <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="personal" id="personal" />
            <Label
              htmlFor="personal"
              className="flex items-center cursor-pointer flex-1"
            >
              <User className="mr-3 h-5 w-5" />
              <div>
                <div className="font-medium">Personal</div>
                <div className="text-sm text-muted-foreground">
                  Create a personal publisher profile
                </div>
              </div>
            </Label>
          </div>
          {organizations.length > 0 && (
            <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="organization" id="organization" />
              <Label
                htmlFor="organization"
                className="flex items-center cursor-pointer flex-1"
              >
                <Building2 className="mr-3 h-5 w-5" />
                <div>
                  <div className="font-medium">Organization</div>
                  <div className="text-sm text-muted-foreground">
                    Create a publisher profile for your organization
                  </div>
                </div>
              </Label>
            </div>
          )}
        </RadioGroup>

        {ownershipType === 'organization' && (
          <div className="ml-6 space-y-3">
            <Label htmlFor="org-select">Select Organization</Label>
            <Select
              value={selectedOrgId}
              onValueChange={setSelectedOrgId}
              disabled={isLoadingOrgs}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {organizations.length === 0 && !isLoadingOrgs && (
              <p className="text-sm text-muted-foreground">
                You don't have admin access to any organizations.
              </p>
            )}
            {errors.organization && (
              <p className="text-sm text-red-600">{errors.organization}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="space-y-4">
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
          {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
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
          {errors.id && <p className="text-sm text-red-600">{errors.id}</p>}
          <p className="text-sm text-muted-foreground">
            This will be your unique URL: codebuff.com/publishers/
            {formData.id || 'your-publisher-id'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Contact Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            placeholder="contact@example.com"
            disabled={isLoading}
          />
          <p className="text-sm text-muted-foreground">
            Optional. For users to contact you about your agents.
          </p>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="space-y-4">
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
          <Label>Avatar</Label>
          <AvatarUpload
            value={formData.avatar_url}
            onChange={handleAvatarChange}
            disabled={isLoading || isUploadingAvatar}
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-8">
          <Button
            variant="ghost"
            size="sm"
            className="mr-4"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancel
          </Button>{' '}
        </div>

        <div className="flex items-center mb-8">
          <User className="h-8 w-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-3xl font-bold">Create Publisher Profile</h1>
            <p className="text-muted-foreground">
              Create your public publisher profile to publish agents on the
              Codebuff store.
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              {currentStep === 1 && 'Choose Ownership Type'}
              {currentStep === 2 && 'Basic Information'}
              {currentStep === 3 && 'Profile Details'}{' '}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}

              <div className="flex justify-between pt-6 mt-6 border-t">
                <div>
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      disabled={isLoading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                  )}
                </div>

                <div className="flex space-x-3">
                  {currentStep < totalSteps ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={isLoading}
                    >
                      Continue
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={
                        isLoading ||
                        isUploadingAvatar ||
                        !!errors.name ||
                        !!errors.id ||
                        !!errors.organization ||
                        (ownershipType === 'organization' && !selectedOrgId)
                      }
                    >
                      {(isLoading || isUploadingAvatar) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {isUploadingAvatar
                        ? 'Uploading...'
                        : 'Create Publisher Profile'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default CreatePublisherPage
