import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'

export interface OrganizationDetails {
  id: string
  name: string
  slug: string
  description?: string
  owner_id: string
  created_at: string
  userRole: 'owner' | 'admin' | 'member'
  memberCount: number
  repositoryCount: number
  creditBalance: number // Made non-optional since API always provides a value
  hasStripeSubscription: boolean
  stripeSubscriptionId?: string
}

export interface BillingStatus {
  is_setup: boolean
  stripe_customer_id?: string
  billing_portal_url?: string
  user_role: string
}

// Query functions
const fetchOrganizationBySlug = async (
  slug: string,
): Promise<OrganizationDetails> => {
  const response = await fetch(`/api/orgs/slug/${slug}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch organization')
  }

  return response.json()
}

const fetchBillingStatus = async (orgId: string): Promise<BillingStatus> => {
  const response = await fetch(`/api/orgs/${orgId}/billing/setup`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch billing status')
  }

  return response.json()
}

export function useOrganizationData(orgSlug: string) {
  const { status } = useSession()

  // Query for organization details
  const {
    data: organization,
    isLoading: isLoadingOrg,
    error: orgError,
    isError: isOrgError,
  } = useQuery({
    queryKey: ['organization', orgSlug],
    queryFn: () => fetchOrganizationBySlug(orgSlug),
    enabled: status === 'authenticated' && !!orgSlug,
  })

  // Query for billing status (depends on organization data)
  const { data: billingStatus, isLoading: isLoadingBilling } = useQuery({
    queryKey: ['billing-status', organization?.id],
    queryFn: () => fetchBillingStatus(organization!.id),
    enabled: !!organization?.id,
  })

  const isLoading = isLoadingOrg || isLoadingBilling
  const error = isOrgError ? (orgError as Error)?.message : null

  return {
    organization,
    billingStatus,
    isLoading,
    error,
    isLoadingOrg,
    isLoadingBilling,
  }
}
