'use client'

import { env } from '@codebuff/common/env'
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { useOrganizationData } from '@/hooks/use-organization-data'

interface OrganizationDetails {
  id: string
  name: string
  slug: string
  userRole: 'owner' | 'admin' | 'member'
}

export default function BillingSetupPage() {
  const { data: session, status } = useSession()
  const params = useParams() ?? {}
  const router = useRouter()
  const orgSlug = (params.slug as string) ?? ''

  const [settingUp, setSettingUp] = useState(false)

  // Use the custom hook for organization data
  const { organization, isLoading, error } = useOrganizationData(orgSlug)

  const handleSetupBilling = async () => {
    if (!organization) return

    setSettingUp(true)
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
      const stripe = (await import('@stripe/stripe-js')).loadStripe(
        env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      )

      const stripeInstance = await stripe
      if (stripeInstance) {
        const { error } = await stripeInstance.redirectToCheckout({
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
      setSettingUp(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">{error}</p>
              <Link href="/orgs">
                <Button>Back to Organizations</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Organization Not Found</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                The organization you're looking for could not be found.
              </p>
              <Link href="/orgs">
                <Button>Back to Organizations</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Check if user has permission to setup billing
  const canManageBilling =
    organization.userRole === 'owner' || organization.userRole === 'admin'

  if (!canManageBilling) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                You don't have permission to setup billing for this
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
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Link href={`/orgs/${orgSlug}`}>
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {organization.name}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Setup Billing</h1>
            <p className="text-muted-foreground">
              Add a payment method for {organization.name}
            </p>
          </div>
        </div>

        {/* Setup Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Add Payment Method
            </CardTitle>
            <CardDescription>
              Add a credit card to enable automatic billing and credit purchases
              for your organization. You'll need to load a credit balance after
              adding your payment method.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">What happens next?</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  • You'll be redirected to Stripe to securely add your payment
                  method
                </li>
                <li>• No charges will be made during this setup process</li>
                <li>
                  • After setup, you can purchase credits for your organization
                </li>
                <li>
                  • You can enable auto-topup to automatically maintain your
                  credit balance
                </li>
              </ul>
            </div>

            <Button
              onClick={handleSetupBilling}
              disabled={settingUp}
              className="w-full"
              size="lg"
            >
              {settingUp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Add Payment Method
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
