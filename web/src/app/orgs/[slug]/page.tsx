'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
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
import { useState } from 'react'

export default function OrganizationPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.slug as string
  const isMobile = useIsMobile()

  const [creditPurchaseOpen, setCreditPurchaseOpen] = useState(false)
  const [creditAmount, setCreditAmount] = useState('1000')
  const [purchasing, setPurchasing] = useState(false)

  // Use the custom hook for organization data
  const { organization, billingStatus, isLoading, error } = useOrganizationData(orgSlug)

  const handleSetupBilling = () => {
    // Navigate to the dedicated billing setup page using slug
    router.push(`/orgs/${orgSlug}/billing/setup`)
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
                <Button onClick={() => window.location.reload()}>Try Again</Button>
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
              <h1 className="text-2xl sm:text-3xl font-bold break-words">{organization.name}</h1>
              <Badge variant="secondary" className="self-start sm:self-auto">{organization.userRole}</Badge>
            </div>
            {organization.description && (
              <p className="text-muted-foreground mt-2">{organization.description}</p>
            )}
          </div>
          {canManageOrg && (
            <div className="flex-shrink-0">
              <Link href={`/orgs/${orgSlug}/settings`}>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <Settings className="h-4 w-4" />
                  {!isMobile && <span className="ml-2">Settings</span>}
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Billing Setup Section */}
        {canManageBilling && !billingStatus?.is_setup && (
          <Card className="mb-8 border-orange-200 bg-orange-50">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
                <div className="flex items-center">
                  <AlertCircle className="mr-3 h-5 w-5 text-orange-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-orange-800">Billing Setup Required</h3>
                    <p className="text-sm text-orange-700">
                      Set up billing to purchase credits and enable team usage tracking.
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={handleSetupBilling} 
                  className="bg-orange-600 hover:bg-orange-700 flex-shrink-0 w-full sm:w-auto"
                >
                  Set Up Billing
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {organization.memberCount}
              </div>
            </CardContent>
          </Card>

          <Card>
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
            </CardContent>
          </Card>

          <Card>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Billing Status
              </CardTitle>
              {billingStatus?.is_setup ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {billingStatus?.is_setup ? 'Active' : 'Not Set Up'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Billing Alerts */}
        {billingStatus?.is_setup && (
          <div className="mb-8">
            <BillingAlerts organizationId={organization.id} />
          </div>
        )}

        {/* Credit Monitor */}
        {billingStatus?.is_setup && (
          <div className="mb-8">
            <CreditMonitor organizationId={organization.id} />
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Credit Purchase */}
          {billingStatus?.is_setup && canManageBilling && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="mr-2 h-5 w-5" />
                  Purchase Credits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Add credits to your organization's balance for team usage.
                </p>
                <Dialog
                  open={creditPurchaseOpen}
                  onOpenChange={setCreditPurchaseOpen}
                >
                  <DialogTrigger asChild>
                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Buy Credits
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Purchase Credits</DialogTitle>
                      <DialogDescription>
                        Choose how many credits to add to your organization's
                        balance.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="credit-amount">Credit Amount</Label>
                        <Input
                          id="credit-amount"
                          type="number"
                          min={CREDIT_PRICING.MIN_PURCHASE_CREDITS.toString()}
                          step="100"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          placeholder="1000"
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum: {CREDIT_PRICING.MIN_PURCHASE_CREDITS} credits
                          • {CREDIT_PRICING.DISPLAY_RATE}
                        </p>
                      </div>
                      <div className="bg-muted p-3 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span>Credits:</span>
                          <span>{parseInt(creditAmount) || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span>Total Cost:</span>
                          <span>
                            $
                            {(
                              ((parseInt(creditAmount) || 0) *
                                CREDIT_PRICING.CENTS_PER_CREDIT) /
                              100
                            ).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCreditPurchaseOpen(false)}
                        disabled={purchasing}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handlePurchaseCredits}
                        disabled={purchasing}
                      >
                        {purchasing ? 'Processing...' : 'Purchase Credits'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          )}

          {/* Team Management */}
          {canManageOrg && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  Team Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Invite members and manage team permissions.
                </p>
                <Link href={`/orgs/${orgSlug}/team`}>
                  <Button variant="outline" className="w-full">
                    <Users className="mr-2 h-4 w-4" />
                    Manage Team
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Repository Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitBranch className="mr-2 h-5 w-5" />
                Repository Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Manage repositories for credit delegation and usage tracking.
              </p>
              <Link href={`/orgs/${orgSlug}/repositories`}>
                <Button variant="outline" className="w-full">
                  <GitBranch className="mr-2 h-4 w-4" />
                  Manage Repositories
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Usage Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="mr-2 h-5 w-5" />
                Usage Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View detailed usage statistics and billing history.
              </p>
              <Link href={`/orgs/${orgSlug}/usage`}>
                <Button variant="outline" className="w-full">
                  View Usage
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Billing Portal */}
          {billingStatus?.billing_portal_url && canManageBilling && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="mr-2 h-5 w-5" />
                  Billing Portal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Manage payment methods and billing settings.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    window.open(billingStatus.billing_portal_url, '_blank')
                  }
                >
                  Open Portal
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
