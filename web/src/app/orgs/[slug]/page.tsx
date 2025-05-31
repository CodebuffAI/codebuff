'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ArrowLeft,
  Building2,
  Users,
  GitBranch,
  CreditCard,
  Settings,
  Plus,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'
import { CreditMonitor } from '@/components/organization/credit-monitor'
import { BillingAlerts } from '@/components/organization/billing-alerts'
import { TeamManagement } from '@/components/organization/team-management'
import { RepositoryManagement } from '@/components/organization/repository-management'
import { useIsMobile } from '@/hooks/use-mobile'
import { useOrganizationData } from '@/hooks/use-organization-data'
import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'

export default function OrganizationPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgSlug = params.slug as string
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
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to setup billing')
      }

      const { sessionId } = await response.json()

      // Redirect to Stripe Checkout
      const stripe = await loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
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
    section: 'members' | 'repositories' | 'creditBalance'
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
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Link href="/orgs">
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Organizations
            </Button>
          </Link>
        </div>

        <div className="flex justify-between items-start mb-8">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
              <Building2 className="h-8 w-8 text-blue-600 flex-shrink-0" />
              <h1 className="text-2xl sm:text-3xl font-bold break-words">
                {organization.name}
              </h1>
              <Badge variant="secondary" className="self-start sm:self-auto">
                {organization.userRole}
              </Badge>
            </div>
            {organization.description && (
              <p className="text-muted-foreground mt-2">
                {organization.description}
              </p>
            )}
          </div>
          {canManageOrg && (
            <div className="flex-shrink-0 flex gap-2">
              {canManageBilling && organization.hasStripeSubscription && (
                <Link href={`/orgs/${orgSlug}/billing/purchase`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    <CreditCard className="h-4 w-4" />
                    {!isMobile && <span className="ml-2">Buy Credits</span>}
                  </Button>
                </Link>
              )}
              <Link href={`/orgs/${orgSlug}/settings`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Settings className="h-4 w-4" />
                  {!isMobile && <span className="ml-2">Settings</span>}
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Low Credit Balance Notification */}
        {hasLowCredits && (
          <Card className="mb-8 border-red-200 bg-red-50">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
                <div className="flex items-center">
                  <AlertCircle className="mr-3 h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-red-800">
                      Low Credit Balance
                    </h3>
                    <p className="text-sm text-red-700">
                      Your organization has{' '}
                      {organization.creditBalance.toLocaleString()} credits
                      remaining. Consider purchasing more credits to avoid
                      service interruption.
                    </p>
                  </div>
                </div>
                {canManageBilling && (
                  <Link href={`/orgs/${orgSlug}/billing/purchase`}>
                    <Button className="text-center text-white bg-red-600 hover:bg-red-700 flex-shrink-0 w-full sm:w-auto">
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
          <Card className="mb-8 border-orange-200 bg-orange-50">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
                <div className="flex items-center">
                  <AlertCircle className="mr-3 h-5 w-5 text-orange-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-orange-800">
                      Billing Setup Required
                    </h3>
                    <p className="text-sm text-orange-700">
                      Set up billing to purchase credits and enable team usage
                      tracking.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleSetupBilling()}
                  disabled={settingUpBilling}
                  className="text-center text-white bg-orange-600 hover:bg-orange-700 flex-shrink-0 w-full sm:w-auto"
                >
                  {settingUpBilling ? 'Setting up...' : 'Set up billing'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {/* Members Card - Collapsible */}
          <Collapsible
            open={activeSection === 'members'}
            onOpenChange={() => handleSectionToggle('members')}
          >
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200">
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                  <CardContent>
                    <div className="text-2xl font-bold">
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
                  <CardContent className="px-4 pb-4 pt-0">
                    {canManageOrg ? (
                      <TeamManagement
                        organizationId={organization.id}
                        userRole={organization.userRole}
                        noCardWrapper={true}
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p>You don't have permission to manage team members.</p>
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
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                  <CardContent>
                    <div className="text-2xl font-bold">
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
                  <CardContent className="px-4 pb-4 pt-0">
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
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200">
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                  <CardContent>
                    <div className="text-2xl font-bold">
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
                  <CardContent className="px-4 pb-4 pt-0">
                    {organization.hasStripeSubscription ? (
                      <CreditMonitor organizationId={organization.id} noCardWrapper={true} />
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <CreditCard className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm">
                          Set up billing to view credit monitor.
                        </p>
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
                noCardWrapper={isMobile}
              />
            )}

            {/* Repositories Management Section */}
            {activeSection === 'repositories' && (
              <RepositoryManagement
                organizationId={organization.id}
                userRole={organization.userRole}
                noCardWrapper={isMobile}
              />
            )}

            {/* Credit Balance Section */}
            {activeSection === 'creditBalance' && (
              <div className="space-y-6">
                {organization.hasStripeSubscription ? (
                  <CreditMonitor organizationId={organization.id} />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <AlertCircle className="mr-2 h-5 w-5 text-orange-600" />
                        Billing Setup Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">
                        Please set up billing to monitor usage and purchase
                        credits for your organization.
                      </p>
                      {canManageBilling && (
                        <Button
                          onClick={() => handleSetupBilling()}
                          disabled={settingUpBilling}
                          size="sm"
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                        >
                          {settingUpBilling
                            ? 'Setting up...'
                            : 'Set Up Billing'}
                        </Button>
                      )}
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
