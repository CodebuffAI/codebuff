/**
 * Test fixtures for billing functions.
 * 
 * This file provides test data and mock implementations for testing billing
 * functions with dependency injection.
 */

import type { Logger } from '../../types/contracts/logger'
import type { GrantType } from '../../types/grant'
import type { MockCreditGrant, MockUser, MockDbConfig } from '../mock-db'

// ============================================================================
// Test constants
// ============================================================================

/**
 * Test user ID for billing tests.
 * Use this shared ID in tests instead of hardcoding user IDs.
 */
export const TEST_BILLING_USER_ID = 'test-billing-user-id'

// ============================================================================
// Test date helpers
// ============================================================================

/**
 * Creates a future date (30 days from now by default)
 */
export function createFutureDate(daysFromNow = 30): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}

/**
 * Creates a past date (30 days ago by default)
 */
export function createPastDate(daysAgo = 30): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
}

// ============================================================================
// Mock credit grants
// ============================================================================

/**
 * Creates a mock credit grant with sensible defaults
 */
export function createMockCreditGrant(
  overrides: Partial<MockCreditGrant> & { user_id: string },
): MockCreditGrant {
  return {
    operation_id: `grant-${Math.random().toString(36).slice(2)}`,
    principal: 1000,
    balance: 1000,
    type: 'free' as GrantType,
    description: 'Test credit grant',
    priority: 10,
    expires_at: createFutureDate(),
    created_at: new Date(),
    org_id: null,
    ...overrides,
  }
}

/**
 * Creates a set of typical credit grants for a user
 */
export function createTypicalUserGrants(userId: string): MockCreditGrant[] {
  return [
    createMockCreditGrant({
      user_id: userId,
      operation_id: 'free-grant-1',
      principal: 500,
      balance: 300,
      type: 'free',
      priority: 10,
      expires_at: createFutureDate(30),
    }),
    createMockCreditGrant({
      user_id: userId,
      operation_id: 'purchase-grant-1',
      principal: 1000,
      balance: 800,
      type: 'purchase',
      priority: 50,
      expires_at: null, // Purchased credits don't expire
    }),
  ]
}

/**
 * Creates organization credit grants
 */
export function createOrgGrants(
  userId: string,
  orgId: string,
): MockCreditGrant[] {
  return [
    createMockCreditGrant({
      user_id: userId,
      operation_id: 'org-grant-1',
      principal: 1000,
      balance: 800,
      type: 'organization',
      priority: 60,
      expires_at: createFutureDate(30),
      org_id: orgId,
    }),
  ]
}

// ============================================================================
// Mock users
// ============================================================================

/**
 * Creates a mock user with sensible defaults
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: TEST_BILLING_USER_ID,
    next_quota_reset: createFutureDate(30),
    auto_topup_enabled: false,
    auto_topup_threshold: null,
    auto_topup_amount: null,
    stripe_customer_id: null,
    ...overrides,
  }
}

/**
 * Creates a user with auto-topup enabled
 */
export function createAutoTopupUser(
  overrides: Partial<MockUser> = {},
): MockUser {
  return createMockUser({
    auto_topup_enabled: true,
    auto_topup_threshold: 100,
    auto_topup_amount: 500,
    stripe_customer_id: 'cus_test123',
    ...overrides,
  })
}

// ============================================================================
// Mock balance results
// ============================================================================

/**
 * Creates a typical balance result
 */
export function createMockBalance(overrides: Partial<{
  totalRemaining: number
  totalDebt: number
  netBalance: number
  breakdown: Record<GrantType, number>
  principals: Record<GrantType, number>
}> = {}) {
  const defaultBreakdown: Record<GrantType, number> = {
    free: 500,
    purchase: 500,
    referral: 0,
    admin: 0,
    organization: 0,
    ad: 0,
  }
  
  const defaultPrincipals: Record<GrantType, number> = {
    free: 500,
    purchase: 500,
    referral: 0,
    admin: 0,
    organization: 0,
    ad: 0,
  }

  return {
    totalRemaining: 1000,
    totalDebt: 0,
    netBalance: 1000,
    breakdown: { ...defaultBreakdown, ...overrides.breakdown },
    principals: { ...defaultPrincipals, ...overrides.principals },
    ...overrides,
  }
}

// ============================================================================
// Complete mock configurations
// ============================================================================

/**
 * Creates a complete mock db config for a typical user scenario
 */
export function createTypicalUserDbConfig(
  userId: string = TEST_BILLING_USER_ID,
): MockDbConfig {
  return {
    users: [createMockUser({ id: userId })],
    creditGrants: createTypicalUserGrants(userId),
    referrals: [],
  }
}

/**
 * Creates a mock db config for a user with expired quota reset
 */
export function createExpiredQuotaDbConfig(
  userId: string = TEST_BILLING_USER_ID,
): MockDbConfig {
  return {
    users: [
      createMockUser({
        id: userId,
        next_quota_reset: createPastDate(5), // Expired 5 days ago
      }),
    ],
    creditGrants: [
      createMockCreditGrant({
        user_id: userId,
        operation_id: 'expired-free-grant',
        principal: 500,
        balance: 0, // Fully consumed
        type: 'free',
        expires_at: createPastDate(5),
      }),
    ],
    referrals: [],
  }
}

/**
 * Creates a mock db config for an organization billing scenario
 */
export function createOrgBillingDbConfig(params: {
  userId: string
  orgId: string
  orgName?: string
  orgSlug?: string
}): MockDbConfig {
  const { userId, orgId, orgName = 'Test Org', orgSlug = 'test-org' } = params
  
  return {
    users: [createMockUser({ id: userId })],
    creditGrants: createOrgGrants(userId, orgId),
    organizations: [
      {
        id: orgId,
        name: orgName,
        slug: orgSlug,
        stripe_customer_id: 'cus_org_test',
        current_period_start: createPastDate(15),
        current_period_end: createFutureDate(15),
      },
    ],
    orgMembers: [
      {
        org_id: orgId,
        user_id: userId,
        role: 'member',
      },
    ],
    orgRepos: [],
  }
}

// ============================================================================
// Test logger
// ============================================================================

/**
 * Silent test logger - use when you don't need to capture log output
 */
export const testLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/**
 * Creates a logger that captures log calls for assertions
 */
export function createCapturingLogger() {
  const logs: Array<{ level: string; data: unknown; msg?: string }> = []
  
  return {
    logger: {
      debug: (data: unknown, msg?: string) => logs.push({ level: 'debug', data, msg }),
      info: (data: unknown, msg?: string) => logs.push({ level: 'info', data, msg }),
      warn: (data: unknown, msg?: string) => logs.push({ level: 'warn', data, msg }),
      error: (data: unknown, msg?: string) => logs.push({ level: 'error', data, msg }),
    } as Logger,
    logs,
    getLogsByLevel: (level: string) => logs.filter(l => l.level === level),
    clear: () => { logs.length = 0 },
  }
}
