'use client'

import { useState, useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  ArrowLeft,
  User,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'
import { OwnershipStep } from '@/components/publisher/ownership-step'
import { BasicInfoStep } from '@/components/publisher/basic-info-step'
import { ProfileDetailsStep } from '@/components/publisher/profile-details-step'
import {
  validatePublisherName,
  validatePublisherId,
} from '@/lib/validators/publisher'

interface Organization {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
}

// Pure utility functions
const generateIdFromName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const filterAdminOrganizations = (
  organizations: Organization[],
): Organization[] => {
  return organizations.filter(
    (org) => org.role === 'owner' || org.role === 'admin',
  )
}

const buildSubmitPayload = (
  formData: {
    id: string
    name: string
    email: string
    bio: string
    avatar_url: string
  },
  selectedOrgId: string | null | undefined,
) => {
  return {
    id: formData.id,
    name: formData.name,
    email: formData.email || undefined,
    bio: formData.bio || undefined,
    avatar_url: formData.avatar_url || undefined,
    org_id: selectedOrgId && selectedOrgId !== '' ? selectedOrgId : undefined,
  }
}

const CreatePublisherPageContent = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  // Step management
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 3

  // Initialize state from URL parameters
  const orgParam = searchParams.get('org')

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
  const [hasRemovedAvatar, setHasRemovedAvatar] = useState(false)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null | undefined>(
    orgParam || undefined,
  )

  // Clean up URL parameters after initialization
  useEffect(() => {
    if (orgParam) {
      const url = new URL(window.location.href)
      url.searchParams.delete('org')
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
        return filterAdminOrganizations(data.organizations)
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

  // Debounced ID for validation
  const [debouncedId] = useDebounce(formData.id, 500)

  // ID validation query
  const { data: idValidationResult, isLoading: isValidatingId } = useQuery({
    queryKey: ['validate-publisher-id', debouncedId],
    queryFn: async () => {
      const response = await fetch(
        `/api/publishers/validate?id=${encodeURIComponent(debouncedId)}`,
      )
      if (!response.ok) {
        throw new Error('Failed to validate ID')
      }
      return response.json() as Promise<{
        valid: boolean
        error: string | null
      }>
    },
    enabled: !!(debouncedId && !validatePublisherId(debouncedId)),
    retry: false,
  })

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setFormData({ ...formData, name: newName })

    // Auto-generate ID from name if ID hasn't been manually edited
    if (!isIdManuallyEdited) {
      const autoId = generateIdFromName(newName)
      setFormData((prev) => ({ ...prev, name: newName, id: autoId }))
    } else {
      setFormData((prev) => ({ ...prev, name: newName }))
    }

    const nameError = validatePublisherName(newName) || ''
    setErrors((prev) => ({ ...prev, name: nameError }))
  }

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value.toLowerCase()
    setFormData({ ...formData, id: newId })
    setIsIdManuallyEdited(true)
    const idError = validatePublisherId(newId) || ''
    setErrors((prev) => ({ ...prev, id: idError }))
  }

  const handleAvatarChange = async (file: File | null, url: string) => {
    setFormData((prev) => ({ ...prev, avatar_url: url }))

    // Track if user explicitly removed the avatar
    if (!url) {
      setHasRemovedAvatar(true)
    } else {
      setHasRemovedAvatar(false)
    }
  }

  const handleSubmit = async () => {
    const nameError = validatePublisherName(formData.name) || ''
    const idError = validatePublisherId(formData.id) || ''
    let orgError = ''

    if (selectedOrgId === undefined) {
      orgError = 'Please choose personal or organization'
    } else if (selectedOrgId === '') {
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
      const response = await fetch('/api/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildSubmitPayload(formData, selectedOrgId)),
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

  const handleNext = () => {
    if (currentStepData.isValid()) {
      nextStep()
    } else {
      // Set errors based on current step
      const errors: Record<string, string> = {}

      if (currentStep === 1) {
        if (selectedOrgId === undefined) {
          errors.organization = 'Please choose personal or organization'
        } else if (selectedOrgId === '') {
          errors.organization = 'Please select an organization'
        }
      } else if (currentStep === 2) {
        // Organization validation (carried from step 1)
        if (selectedOrgId === undefined) {
          errors.organization = 'Please choose personal or organization'
        } else if (selectedOrgId === '') {
          errors.organization = 'Please select an organization'
        }

        // Name and ID validation
        const nameError = validatePublisherName(formData.name)
        const idError = validatePublisherId(formData.id)
        if (nameError) errors.name = nameError
        if (idError) errors.id = idError
      }

      setErrors(errors)
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
          <div className="flex items-center mb-8">
            <Skeleton className="h-8 w-20 mr-4" />
          </div>
          <div className="flex items-center mb-8">
            <Skeleton className="h-8 w-8 rounded-full mr-3" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <div className="flex justify-between pt-6">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
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

  const steps = [
    {
      title: 'Choose Ownership Type',
      component: (
        <OwnershipStep
          selectedOrgId={selectedOrgId}
          onSelectedOrgIdChange={setSelectedOrgId}
          organizations={organizations}
          isLoadingOrgs={isLoadingOrgs}
          errors={errors}
        />
      ),
      isValid: () => selectedOrgId !== undefined && selectedOrgId !== '',
    },
    {
      title: 'Basic Information',
      component: (
        <BasicInfoStep
          formData={formData}
          onNameChange={handleNameChange}
          onIdChange={handleIdChange}
          onEmailChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
          errors={errors}
          isLoading={isLoading}
          isValidatingId={isValidatingId}
          idValidationResult={idValidationResult || null}
        />
      ),
      isValid: () => {
        const nameError = validatePublisherName(formData.name)
        const idError = validatePublisherId(formData.id)
        const hasValidationErrors = !!nameError || !!idError
        const hasInvalidId = idValidationResult && !idValidationResult.valid
        const hasOrgError = selectedOrgId === undefined || selectedOrgId === ''

        return !hasValidationErrors && !hasInvalidId && !hasOrgError
      },
    },
    {
      title: 'Profile Details',
      component: (
        <ProfileDetailsStep
          formData={formData}
          onBioChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          onAvatarChange={handleAvatarChange}
          isLoading={isLoading}
          isUploadingAvatar={false}
        />
      ),
      isValid: () => {
        const nameError = validatePublisherName(formData.name)
        const idError = validatePublisherId(formData.id)
        const hasValidationErrors = !!nameError || !!idError
        const hasInvalidId = idValidationResult && !idValidationResult.valid
        const hasOrgError = selectedOrgId === undefined || selectedOrgId === ''

        return (
          !isLoading &&
          !hasValidationErrors &&
          !hasInvalidId &&
          !hasOrgError &&
          !errors.name &&
          !errors.id &&
          !errors.organization
        )
      },
    },
  ]

  const currentStepData = steps[currentStep - 1]

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
              {currentStepData.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              {currentStepData.component}

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
                      disabled={isLoading || !currentStepData.isValid()}
                    >
                      Continue
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!currentStepData.isValid()}
                    >
                      {isLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Create Publisher Profile
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

const CreatePublisherPage = () => {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-6 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center mb-8">
              <div className="h-8 w-20 mr-4 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex items-center mb-8">
              <div className="h-8 w-8 rounded-full mr-3 bg-muted animate-pulse" />
              <div>
                <div className="h-8 w-64 mb-2 bg-muted animate-pulse rounded" />
                <div className="h-4 w-96 bg-muted animate-pulse rounded" />
              </div>
            </div>
            <Card>
              <CardHeader>
                <div className="h-6 w-48 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="h-10 w-full bg-muted animate-pulse rounded" />
                  <div className="h-10 w-full bg-muted animate-pulse rounded" />
                  <div className="h-20 w-full bg-muted animate-pulse rounded" />
                  <div className="flex justify-between pt-6">
                    <div className="h-10 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-10 w-24 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      }
    >
      <CreatePublisherPageContent />
    </Suspense>
  )
}

export default CreatePublisherPage
