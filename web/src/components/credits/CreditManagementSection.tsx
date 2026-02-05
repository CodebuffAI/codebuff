import { env } from '@codebuff/common/env'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Loader2 } from 'lucide-react'

import { CreditManagementSkeleton } from './CreditManagementSkeleton'
import { CreditPurchaseSection } from './CreditPurchaseSection'

import { AutoTopupSettings } from '@/components/auto-topup/AutoTopupSettings'
import { OrgAutoTopupSettings } from '@/components/auto-topup/OrgAutoTopupSettings'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

export interface CreditManagementSectionProps {
  onPurchase: (credits: number) => void
  isPurchasePending: boolean
  showAutoTopup?: boolean
  className?: string
  context?: 'user' | 'organization'
  organizationId?: string
  isOrganization?: boolean // Keep for backward compatibility
  isLoading?: boolean
  email?: string
}

export { CreditManagementSkeleton }

export function CreditManagementSection({
  onPurchase,
  isPurchasePending,
  showAutoTopup = true,
  className,
  context = 'user',
  organizationId,
  isOrganization = false,
  isLoading = false,
  email,
}: CreditManagementSectionProps) {
  // Determine if we're in organization context
  const isOrgContext = context === 'organization' || isOrganization

  const fallbackPortalUrl = email
    ? `${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${encodeURIComponent(email)}`
    : env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/billing-portal', {
        method: 'POST',
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to open billing portal' }))
        throw new Error(error.error || 'Failed to open billing portal')
      }
      const data = await res.json()
      return data.url as string
    },
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    onError: () => {
      // Fall back to the prefilled email portal URL on error
      window.open(fallbackPortalUrl, '_blank', 'noopener,noreferrer')
      toast({
        title: 'Note',
        description: 'Opened billing portal - you may need to sign in.',
      })
    },
  })

  if (isLoading) {
    return <CreditManagementSkeleton />
  }

  return (
    <div className={className}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">Buy Credits</h3>
          {/* Only show billing portal button for user context - orgs have their own button */}
          {!isOrgContext && (
            <Button
              variant="link"
              size="sm"
              onClick={() => billingPortalMutation.mutate()}
              disabled={billingPortalMutation.isPending}
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/90 p-0 h-auto"
            >
              {billingPortalMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Opening...
                </>
              ) : (
                <>Billing Portal <ExternalLink className="ml-1 h-3 w-3" /></>
              )}
            </Button>
          )}
        </div>
        <CreditPurchaseSection
          onPurchase={onPurchase}
          isPurchasePending={isPurchasePending}
          isOrganization={isOrgContext}
        />
        {showAutoTopup &&
          (isOrgContext && organizationId ? (
            <OrgAutoTopupSettings organizationId={organizationId} />
          ) : (
            <AutoTopupSettings />
          ))}
      </div>
    </div>
  )
}
