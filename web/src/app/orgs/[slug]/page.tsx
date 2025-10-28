'use client'

import { loadStripe } from '@stripe/stripe-js'
import {
  ArrowLeft,
  Building2,
  Users,
  GitBranch,
  CreditCard,
  Settings,
  Plus,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

import { CreditMonitor } from '@/components/organization/credit-monitor'
import { RepositoryManagement } from '@/components/organization/repository-management'
import { TeamManagement } from '@/components/organization/team-management'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'
import { useOrganizationData } from '@/hooks/use-organization-data'

export default function OrganizationPage() {
  const { data: session, status } = useSession()
  const params = useParams() ?? {}
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const orgSlug = (params.slug as string) ?? ''
  const isMobile = useIsMobile()

  const [settingUpBilling, setSettingUpBilling] = useState(false)

  // Collapsible states - only one can be open at a time
  const [activeSection, setActiveSection] = useState<
    'members' | 'repositories' | 'creditBalance' | null
  >('creditBalance') // Default to showing credit monitor

  // Use the custom hook for organization data
  const { organization, billingStatus, isLoading, error } =
    useOrganizationData(orgSlug)

  // Define low credit threshold
  const LOW_CREDIT_THRESHOLD = 2000

  // Check for subscription success
  useEffect(() => {
    if (searchParams.get('subscription_success') === 'true') {
      toast({
        title: 'Subscription Active!',
        description:
          'Your organization subscription has been set up successfully.',
      })
      // Clean up the URL
      router.replace(`/orgs/${orgSlug}`, { scroll: false })
    }
  }, [searchParams, orgSlug, router])

  const handleSetupBilling = async () => {
    if (!organization) return

    setSettingUpBilling(true)
    try {
      const response = await fetch(
        `/api/orgs/${organization.id}/billing/setup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to setup billing')
      }

      const { sessionId } = await response.json()

      // Redirect to Stripe Checkout
      const stripe = await loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      )

      if (stripe) {
        const { error } = await stripe.redirectToCheckout({
          sessionId,
        })

        if (error) {
          throw new Error(error.message)
        }
      }
    } catch (error: any) {
      console.error('Error setting up billing:', error)
      toast({
        title: 'Setup Failed',
        description:
          error.message || 'Failed to setup billing. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSettingUpBilling(false)
    }
  }

  const handleSectionToggle = (
    section: 'members' | 'repositories' | 'creditBalance',
  ) => {
    setActiveSection(activeSection === section ? null : section)
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
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
              <p className="mb-4">Please sign in to view this organization.</p>
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
                <AlertCircle className="mr-2 h-5 w-5" />
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

  const canManageBilling = organization.userRole === 'owner'
  const canManageOrg =
    organization.userRole === 'owner' || organization.userRole === 'admin'

  // Check if credits are low
  const hasLowCredits =
    organization.hasStripeSubscription &&
    organization.creditBalance < LOW_CREDIT_THRESHOLD

  return (
    <div className="container mx-auto py-4 sm:py-6 px-4">
      <div className="max-w-6xl mx-auto px-0 sm:px-4 lg:px-8">
        {/* Header */}
        <div className="flex items-center mb-6 sm:mb-8">
          <Link href="/orgs">
            <Button
              variant="ghost"
              size="sm"
              className="mr-2 sm:mr-4 px-2 sm:px-3"
            >
              <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Back to Organizations</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 sm:mb-8 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-3 mb-2">
              <div className="flex items-center gap-3">
                <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold break-words min-w-0">
                  {organization.name}
                </h1>
              </div>
              <Badge
                variant="secondary"
                className="self-start text-xs sm:text-sm"
              >
                {organization.userRole}
              </Badge>
            </div>
            {organization.description && (
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                {organization.description}
              </p>
            )}
          </div>
          {canManageOrg && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {canManageBilling && organization.hasStripeSubscription && (
                <Link
                  href={`/orgs/${orgSlug}/billing/purchase`}
                  className="w-full sm:w-auto"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto justify-center"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Buy Credits
                  </Button>
                </Link>
              )}
              <Link
                href={`/orgs/${orgSlug}/settings`}
                className="w-full sm:w-auto"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto justify-center"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Low Credit Balance Notification */}
        {hasLowCredits && (
          <Card className="mb-6 sm:mb-8 border-red-200 bg-red-50">
            <CardContent className="py-3 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-start sm:items-center">
                  <AlertCircle className="mr-3 h-5 w-5 text-red-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                  <div>
                    <h3 className="font-medium text-red-800 text-sm sm:text-base">
                      Low Credit Balance
                    </h3>
                    <p className="text-xs sm:text-sm text-red-700 mt-1">
                      Your organization has{' '}
                      {organization.creditBalance.toLocaleString()} credits
                      remaining. Consider purchasing more credits to avoid
                      service interruption.
                    </p>
                  </div>
                </div>
                {canManageBilling && (
                  <Link
                    href={`/orgs/${orgSlug}/billing/purchase`}
                    className="w-full sm:w-auto"
                  >
                    <Button className="text-center text-white bg-red-600 hover:bg-red-700 w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      Purchase Credits
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Billing Setup Section */}
        {canManageBilling && !organization.hasStripeSubscription && (
          <Card className="mb-6 sm:mb-8 border-orange-200 bg-orange-50">
            <CardContent className="py-3 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-start sm:items-center">
                  <AlertCircle className="mr-3 h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                  <div>
                    <h3 className="font-medium text-orange-800 text-sm sm:text-base">
                      Billing Setup Required
                    </h3>
                    <p className="text-xs sm:text-sm text-orange-700 mt-1">
                      Set up billing to purchase credits and enable team usage
                      tracking.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleSetupBilling()}
                  disabled={settingUpBilling}
                  className="text-center text-white bg-orange-600 hover:bg-orange-700 w-full sm:w-auto"
                >
                  {settingUpBilling ? 'Setting up...' : 'Set up billing'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6 sm:mb-8">
          {/* Members Card - Collapsible */}
          <Collapsible
            open={activeSection === 'members'}
            onOpenChange={() => handleSectionToggle('members')}
          >
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200">
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 py-3 sm:px-6 sm:py-4">
                    <CardTitle className="text-sm font-medium">
                      Members
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {activeSection === 'members' ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 sm:px-6 sm:pb-4">
                    <div className="text-xl sm:text-2xl font-bold">
                      {organization.memberCount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeSection === 'members'
                        ? 'Hide members'
                        : 'View members'}
                    </p>
                  </CardContent>
                </div>
              </CollapsibleTrigger>
              {/* Mobile: Show content inside card */}
              {isMobile && (
                <CollapsibleContent>
                  <CardContent className="px-4 pb-4 pt-0 sm:px-6">
                    {canManageOrg ? (
                      <TeamManagement
                        organizationId={organization.id}
                        userRole={organization.userRole}
                        noCardWrapper={true}
                      />
                    ) : (
                      <div className="text-center py-6 sm:py-8 text-muted-foreground">
                        <Users className="mx-auto h-8 w-8 sm:h-12 sm:w-12 mb-4 opacity-50" />
                        <p className="text-sm">
                          You don't have permission to manage team members.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              )}
            </Card>
          </Collapsible>

          {/* Repositories Card - Collapsible */}
          <Collapsible
            open={activeSection === 'repositories'}
            onOpenChange={() => handleSectionToggle('repositories')}
          >
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200">
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 py-3 sm:px-6 sm:py-4">
                    <CardTitle className="text-sm font-medium">
                      Repositories
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      {activeSection === 'repositories' ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 sm:px-6 sm:pb-4">
                    <div className="text-xl sm:text-2xl font-bold">
                      {organization.repositoryCount}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeSection === 'repositories'
                        ? 'Hide repositories'
                        : 'View repositories'}
                    </p>
                  </CardContent>
                </div>
              </CollapsibleTrigger>
              {/* Mobile: Show content inside card */}
              {isMobile && (
                <CollapsibleContent>
                  <CardContent className="px-4 pb-4 pt-0 sm:px-6">
                    <RepositoryManagement
                      organizationId={organization.id}
                      userRole={organization.userRole}
                      noCardWrapper={true}
                    />
                  </CardContent>
                </CollapsibleContent>
              )}
            </Card>
          </Collapsible>

          {/* Credit Balance Card - Collapsible */}
          <Collapsible
            open={isMobile && activeSection === 'creditBalance'}
            onOpenChange={() => handleSectionToggle('creditBalance')}
          >
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 sm:col-span-2 lg:col-span-1">
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 py-3 sm:px-6 sm:py-4">
                    <CardTitle className="text-sm font-medium">
                      Credit Balance
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      {activeSection === 'creditBalance' ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 sm:px-6 sm:pb-4">
                    <div className="text-xl sm:text-2xl font-bold">
                      {organization.creditBalance !== undefined
                        ? organization.creditBalance.toLocaleString()
                        : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeSection === 'creditBalance'
                        ? 'Hide details'
                        : isMobile
                          ? 'View monitor'
                          : 'View details below'}
                    </p>
                  </CardContent>
                </div>
              </CollapsibleTrigger>
              {/* Mobile: Show CreditMonitor in collapsible content */}
              {isMobile && (
                <CollapsibleContent>
                  <CardContent className="px-4 pb-4 pt-0 sm:px-6">
                    {organization.hasStripeSubscription ? (
                      <CreditMonitor
                        organizationId={organization.id}
                        orgSlug={orgSlug}
                        noCardWrapper={true}
                      />
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <CreditCard className="mx-auto h-6 w-6 sm:h-8 sm:w-8 mb-2 opacity-50" />
                        <p className="text-xs sm:text-sm">
                          Set up billing to monitor credit usage
                        </p>
                        <Link href={`/orgs/${organization.slug}/billing/setup`}>
                          <Button size="sm" className="mt-2 w-full sm:w-auto">
                            Set up billing
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              )}
            </Card>
          </Collapsible>
        </div>

        {/* Desktop: Management Components Below Cards */}
        {!isMobile && (
          <div className="space-y-6 mb-8">
            {/* Members Management Section */}
            {activeSection === 'members' && (
              <TeamManagement
                organizationId={organization.id}
                userRole={organization.userRole}
                noCardWrapper={false}
              />
            )}

            {/* Repositories Management Section */}
            {activeSection === 'repositories' && (
              <RepositoryManagement
                organizationId={organization.id}
                userRole={organization.userRole}
                noCardWrapper={false}
              />
            )}

            {/* Credit Balance Section */}
            {activeSection === 'creditBalance' && (
              <div className="space-y-6">
                {organization.hasStripeSubscription ? (
                  <CreditMonitor
                    organizationId={organization.id}
                    orgSlug={orgSlug}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <CreditCard className="mr-2 h-5 w-5" />
                        Credit Balance
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8 text-muted-foreground">
                        <CreditCard className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <h3 className="text-lg font-semibold mb-2">
                          Billing Not Set Up
                        </h3>
                        <p className="mb-4">
                          Set up billing to start using organization credits and
                          monitor usage.
                        </p>
                        <Link href={`/orgs/${organization.slug}/billing/setup`}>
                          <Button>Set up billing</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
