/* eslint-disable */

// This file defines common types related to organizations,
// used across the web frontend and potentially backend/billing packages.

/**
 * Defines the roles a user can have within an organization.
 * Based on usage in web/src/lib/organization-permissions.ts and API routes.
 */
export type OrganizationRole = 'owner' | 'admin' | 'member'

/**
 * Response structure for the organization usage endpoint.
 * Based on web/src/app/api/orgs/[orgId]/usage/route.ts
 */
export interface OrganizationUsageResponse {
  currentBalance: number
  usageThisCycle: number
  cycleStartDate: string // ISO date string
  cycleEndDate: string // ISO date string
  topUsers: Array<{
    user_id: string
    user_name: string
    user_email: string
    credits_used: number
  }>
  recentUsage: Array<{
    date: string // ISO date string
    credits_used: number
    repository_url: string
    user_name: string
  }>
}

/**
 * Response structure for fetching detailed organization information.
 * Based on web/src/app/api/orgs/[orgId]/route.ts
 */
export interface OrganizationDetailsResponse {
  id: string
  name: string
  slug: string
  description?: string
  userRole: OrganizationRole
  memberCount: number
  repositoryCount: number
  creditBalance?: number
  hasStripeSubscription: boolean
  stripeSubscriptionId?: string
}

/**
 * Request structure for creating a new organization.
 * Based on web/src/app/api/orgs/route.ts
 */
export interface CreateOrganizationRequest {
  name: string
  description?: string
}

/**
 * Represents a single organization in a list.
 * Part of ListOrganizationsResponse.
 */
export interface ListOrganizationsResponseOrganization {
  id: string
  name: string
  slug: string
  role: OrganizationRole
  memberCount: number
  repositoryCount: number
}

/**
 * Response structure for listing organizations a user is part of.
 * Based on web/src/app/api/orgs/route.ts
 */
export interface ListOrganizationsResponse {
  organizations: ListOrganizationsResponseOrganization[]
}

/**
 * Request structure for inviting a member to an organization.
 * Based on web/src/app/api/orgs/[orgId]/members/route.ts POST body
 * and web/src/app/api/orgs/[orgId]/invitations/route.ts
 */
export interface InviteMemberRequest {
  email: string
  role: 'admin' | 'member' // More specific than OrganizationRole for invites
}

/**
 * Request structure for adding a repository to an organization.
 * Based on web/src/app/api/orgs/[orgId]/repos/route.ts POST body
 */
export interface AddRepositoryRequest {
  repository_url: string
  repository_name: string
}

/**
 * Request structure for updating a member's role in an organization.
 * Based on web/src/app/api/orgs/[orgId]/members/[userId]/route.ts PATCH body
 */
export interface UpdateMemberRoleRequest {
  role: OrganizationRole
}

/**
 * General representation of an Organization, potentially mirroring schema.org.
 * Useful if direct schema inference isn't portable or desired for API contracts.
 */
export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  owner_id: string // Assuming user ID
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  billing_cycle_start_date: Date | null // As per organization_credit_consumption_plan.md
  current_period_start: Date | null // From existing API route logic
  current_period_end: Date | null // From existing API route logic
  created_at: Date
  updated_at: Date
  // Add other fields from schema.org as needed for API contracts
}

/**
 * Represents an alert for an organization.
 * Based on web/src/app/api/orgs/[orgId]/alerts/route.ts
 */
export interface OrganizationAlert {
  id: string // Example: could be a UUID or specific format
  type: string // e.g., 'low_balance', 'high_usage', 'payment_failed'
  message: string
  timestamp: Date // This will be serialized to string for JSON responses
  severity: 'info' | 'warning' | 'error' | 'critical'
  isDismissed?: boolean // Optional: if alerts can be dismissed
  // any other relevant fields for an alert
}
