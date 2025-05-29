export interface OrganizationDetailsResponse {
  id: string
  name: string
  slug: string
  description?: string
  userRole: 'owner' | 'admin' | 'member'
  memberCount: number
  repositoryCount: number
  creditBalance: number
  hasStripeSubscription: boolean
  stripeSubscriptionId?: string
}