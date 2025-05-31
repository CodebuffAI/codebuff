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
  CreditCard,
  AlertCircle,
  CheckCircle,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'
import { useOrganizationData } from '@/hooks/use-organization-data'
import { CreditPurchaseSection } from '@/components/credits/CreditPurchaseSection'
import { OrgAutoTopupSettings } from '@/components/auto-topup/OrgAutoTopupSettings'
import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'

export default function OrganizationBillingPurchasePage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgSlug = params.slug as string

  const [purchasing, setPurchasing] = useState(false)
  const [settingUpBilling, setSettingUpBilling] = useState(false)

  // Use the custom hook for organization data
  const { organization, billingStatus, isLoading, error } =
    useOrganizationData(orgSlug)

  // Check if we just completed billing setup
  const setupSuccess = searchParams.get('setup_success') === 'true'

  useEffect(() => {
    if (setupSuccess) {
      toast({
        title: 'Billing Setup Complete!',
        description:
          'Your payment method has been added. You can now purchase credits.',
      })
    }
  }, [setupSuccess])

  const handleSetupBilling = async (credits: number) => {
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

      // Store the intended credit amount in localStorage for after setup
      localStorage.setItem('pendingCreditPurchase', credits.toString())

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

  const handlePurchaseCredits = async (credits: number) => {
    if (!organization) return

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

      const responseData = await response.json()

      if (responseData.direct_charge && responseData.success) {
        // Direct charge was successful - show success message and refresh data
        toast({
          title: 'Credits Purchased!',
          description: `${responseData.credits.toLocaleString()} credits have been added to your organization.`,
        })
        // Optionally refresh organization data here
        window.location.reload()
      } else if (responseData.checkout_url) {
        // Redirect to Stripe Checkout
        window.location.href = responseData.checkout_url
      } else {
        // Handle unexpected response
        throw new Error('Unexpected response from server.')
      }
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

  // Auto-trigger purchase if we have pending credits after setup
  useEffect(() => {
    if (setupSuccess && billingStatus?.is_setup) {
      const pendingCredits = localStorage.getItem('pendingCreditPurchase')
      if (pendingCredits) {
        localStorage.removeItem('pendingCreditPurchase')
        const credits = parseInt(pendingCredits)
        if (credits > 0) {
          handlePurchaseCredits(credits)
        }
      }
    }
  }, [setupSuccess, billingStatus?.is_setup])

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96 w-full" />
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
                Please sign in to manage organization billing.
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

  if (error || !organization) {
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
              <p className="mb-4">{error || 'Organization not found'}</p>
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

  const canManageBilling = organization.userRole === 'owner'

  if (!canManageBilling) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                You don't have permission to manage billing for this
                organization.
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
              Back to {organization.name}
            </Button>
          </Link>
        </div>

        {/* Page Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold">Purchase Credits</h1>
          </div>
          <p className="text-muted-foreground">
            Add credits to <strong>{organization.name}</strong> for team usage
          </p>
        </div>

        {/* Organization Info Card */}
        <Card className="mb-8">
          <CardContent className="py-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">
                Current Balance
              </div>
              <div className="text-3xl font-bold">
                {organization.creditBalance !== undefined
                  ? `${organization.creditBalance.toLocaleString()} credits`
                  : '—'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auto Top-up Settings */}
        {billingStatus?.is_setup && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Auto Top-up Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <OrgAutoTopupSettings organizationId={organization.id} />
            </CardContent>
          </Card>
        )}

        {/* Credit Purchase Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="mr-2 h-5 w-5" />
              Purchase Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreditPurchaseSection
              onPurchase={handlePurchaseCredits}
              isPurchasePending={purchasing || settingUpBilling}
              isOrganization={true}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
