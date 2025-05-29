'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'
import { CreditMonitor } from '@/components/organization/credit-monitor'
import { BillingAlerts } from '@/components/organization/billing-alerts'
import { useIsMobile } from '@/hooks/use-mobile'
import { useOrganizationData } from '@/hooks/use-organization-data'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CREDIT_PRICING } from 'common/src/constants'
import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'

export default function OrganizationPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgSlug = params.slug as string
  const isMobile = useIsMobile()

  const [creditPurchaseOpen, setCreditPurchaseOpen] = useState(false)
  const [creditAmount, setCreditAmount] = useState('1000')
  const [purchasing, setPurchasing] = useState(false)
  const [settingUpBilling, setSettingUpBilling] = useState(false)

  // Use the custom hook for organization data
  const { organization, billingStatus, isLoading, error } =
    useOrganizationData(orgSlug)

  // Check for purchase success and subscription success
  useEffect(() => {
    if (searchParams.get('purchase_success') === 'true') {
      toast({
        title: 'Credits Purchased!',
        description: 'Your organization credits have been successfully added.',
      })
      // Clean up the URL
      router.replace(`/orgs/${orgSlug}`, { scroll: false })
    }

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

  const handlePurchaseCredits = async () => {
    if (!organization) return

    const credits = parseInt(creditAmount)
    if (!credits || credits < CREDIT_PRICING.MIN_PURCHASE_CREDITS) {
      toast({
        title: 'Error',
        description: `Please enter a valid credit amount (minimum ${CREDIT_PRICING.MIN_PURCHASE_CREDITS} credits)`,
        variant: 'destructive',
      })
      return
    }

    setPurchasing(true)
    try {
      const response = await fetch(`/api/orgs/${organization.id}/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: credits }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initiate credit purchase')
      }

      const { checkout_url } = await response.json()
      window.location.href = checkout_url
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to purchase credits',
        variant: 'destructive',
      })
    } finally {
      setPurchasing(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
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
            <div className="flex-shrink-0">
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
                  onClick={handleSetupBilling}
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Members Card - Links to Team Management */}
          <Link href={`/orgs/${orgSlug}/team`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 cursor-pointer transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Members</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {organization.memberCount}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  View members
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Repositories Card - Links to Repository Management */}
          <Link href={`/orgs/${orgSlug}/repositories`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 cursor-pointer transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Repositories
                </CardTitle>
                <GitBranch className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {organization.repositoryCount}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  View repositories
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Credit Balance Card - Links to Usage Analytics */}
          <Link href={`/orgs/${orgSlug}/usage`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 cursor-pointer transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Credit Balance
                </CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {organization.creditBalance !== undefined
                    ? organization.creditBalance.toLocaleString()
                    : '—'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  View usage details
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Billing Status Card - Links to appropriate billing page */}
          <Link 
            href={
              organization.hasStripeSubscription 
                ? `/orgs/${orgSlug}/settings`
                : `/orgs/${orgSlug}/billing/purchase`
            }
          >
            <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 cursor-pointer transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Billing Status
                </CardTitle>
                {organization.hasStripeSubscription ? (
                  organization.creditBalance > 0 ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                  )
                ) : (
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">
                  {organization.hasStripeSubscription
                    ? organization.creditBalance > 0
                      ? 'Active'
                      : 'No Credits'
                    : 'Not Set Up'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {organization.hasStripeSubscription 
                    ? 'View billing settings'
                    : 'Set up billing'
                  }
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Billing Alerts */}
        {organization.hasStripeSubscription && (
          <div className="mb-8">
            <BillingAlerts organizationId={organization.id} />
          </div>
        )}

        {/* Credit Monitor */}
        {organization.hasStripeSubscription && (
          <div className="mb-8">
            <CreditMonitor organizationId={organization.id} />
          </div>
        )}
      </div>
    </div>
  )
}
