export type OrganizationRole = 'owner' | 'admin' | 'member'

export interface OrganizationMember {
  organization_id: string
  user_id: string
  role: OrganizationRole
  joined_at: Date
}

export interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  owner_id: string
  stripe_customer_id?: string
  created_at: Date
  updated_at: Date
}

export interface OrganizationRepository {
  id: string
  organization_id: string
  repository_url: string
  repository_name: string
  approved_by: string
  approved_at: Date
  is_active: boolean
}

export interface OrganizationUsage {
  id: string
  organization_id: string
  user_id: string
  repository_url: string
  credits_used: number
  message_id?: string
  created_at: Date
}

export interface CreateOrganizationRequest {
  name: string
  slug?: string
  description?: string
}

export interface ListOrganizationsResponse {
  organizations: Array<{
    id: string
    name: string
    slug: string
    role: OrganizationRole
    memberCount: number
    repositoryCount: number
  }>
}

export interface OrganizationDetailsResponse {
  id: string
  name: string
  slug: string
  description?: string
  owner_id: string
  created_at: string
  userRole: OrganizationRole
  memberCount: number
  repositoryCount: number
  creditBalance?: number
}

export interface InviteMemberRequest {
  email: string
  role: 'admin' | 'member'
}

export interface UpdateMemberRoleRequest {
  role: 'admin' | 'member'
}

export interface AddRepositoryRequest {
  repository_url: string
  repository_name: string
}

export interface OrganizationUsageResponse {
  currentBalance: number
  usageThisCycle: number
  topUsers: Array<{
    user_id: string
    user_name: string
    credits_used: number
  }>
  recentUsage: Array<{
    date: string
    credits_used: number
    repository_url: string
    user_name: string
  }>
}

export interface CreditDelegationResult {
  useOrganization: boolean
  organizationId?: string
  requiresOverride: boolean
  organizationBalance?: number
  userBalance?: number
}

export interface CreditConsumptionWithDelegationResult {
  success: boolean
  consumed: number
  fromOrganization: boolean
  organizationId?: string
  error?: string
}
