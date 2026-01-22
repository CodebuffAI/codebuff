import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { consumeFromOrderedGrants } from '../balance-calculator'

/**
 * Tests for consumeFromOrderedGrants covering:
 * 1. Consumption code path - consuming from positive grant balances
 * 2. Debt creation edge cases - critical bug fixes for stale balance issues
 * 3. Priority ordering - grants consumed in correct order
 * 4. fromPurchased tracking - correct attribution to purchased credits
 */

// Shared mock setup for all tests
let mockLogger: {
  debug: ReturnType<typeof mock>
  info: ReturnType<typeof mock>
  warn: ReturnType<typeof mock>
  error: ReturnType<typeof mock>
}

let mockTx: {
  select: ReturnType<typeof mock>
  update: ReturnType<typeof mock>
}

beforeEach(() => {
  mockLogger = {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }

  mockTx = {
    select: mock(() => {}),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => Promise.resolve(undefined)),
      })),
    })),
  }
})

describe('consumeFromOrderedGrants', () => {
  it('creates debt when consuming more than available balance from single grant', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: 100,
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 150,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    // All 150 credits should be consumed (100 from balance + 50 as debt)
    expect(result.consumed).toBe(150)
    expect(mockLogger.warn).toHaveBeenCalled() // Debt was created
  })

  it('creates debt on last consumed grant when multiple grants exhausted', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 50,
        balance: 50,
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 50,
        balance: 50,
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 150,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(150)
    expect(result.fromPurchased).toBe(50) // 50 from purchase grant
    expect(mockLogger.warn).toHaveBeenCalled() // Debt was created
  })

  it('creates debt on last grant when all grants are zero or negative', async () => {
    // Note: First pass repays 50 of the debt using 50 credits from creditsToConsume
    // Then second pass finds no positive balances
    // Then debt creation uses remaining 50 credits
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: -50, // Already in debt - will be repaid with 50 credits
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 50,
        balance: 0, // Zero balance
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    // 50 goes to debt repayment, 50 creates new debt
    expect(result.consumed).toBe(100)
    expect(mockLogger.warn).toHaveBeenCalled() // New debt was created
  })

  it('handles exact consumption without creating debt', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: 100,
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    expect(mockLogger.warn).not.toHaveBeenCalled() // No debt created
  })

  it('repays existing debt first before consuming from positive balances', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: -20, // Has debt
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 100,
        balance: 80,
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 50,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(50)
    // First 20 should repay debt, then 30 from purchase grant
    expect(result.fromPurchased).toBe(30)
    expect(mockLogger.debug).toHaveBeenCalled() // Debt repayment was logged
    expect(mockLogger.warn).not.toHaveBeenCalled() // No new debt created
  })

  it('creates debt even when grant had positive balance that was fully consumed', async () => {
    // This is the critical bug case - grant originally had positive balance
    // but was fully consumed, leaving remainingToConsume > 0
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 100,
        balance: 80, // Positive balance
        priority: 1,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100, // More than available
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    // Should consume all 100 (80 from balance + 20 as debt)
    expect(result.consumed).toBe(100)
    expect(result.fromPurchased).toBe(80)
    expect(mockLogger.warn).toHaveBeenCalled() // Debt was created
  })

  it('partial debt repayment with subsequent consumption and new debt', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: -30, // Has 30 debt
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 50,
        balance: 50,
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100, // 30 for debt + 50 from grant-2 + 20 new debt
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    // 30 went to debt repayment, 50 from purchase, 20 new debt
    expect(result.fromPurchased).toBe(50)
    
    // Debt was repaid and new debt was created
    expect(mockLogger.debug).toHaveBeenCalled() // Debt repayment
    expect(mockLogger.warn).toHaveBeenCalled() // New debt created
  })

  it('creates debt on same grant that had its debt repaid in first pass (single grant)', async () => {
    // CRITICAL BUG TEST: This tests the scenario where:
    // 1. Single grant starts with debt (balance = -50)
    // 2. First pass repays the debt using 50 credits (balance becomes 0 in DB)
    // 3. Second pass finds no positive balance to consume from
    // 4. Remaining 50 credits should create new debt on the same grant
    // BUG: If we use stale grant.balance (-50) instead of effective balance (0),
    //      we'd create newBalance = -50 - 50 = -100 instead of 0 - 50 = -50
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: -50, // Starts with 50 debt
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100, // 50 to repay debt + 50 for new debt
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    
    // Both debt repayment and new debt creation should have occurred
    expect(mockLogger.debug).toHaveBeenCalled() // Debt repayment
    expect(mockLogger.warn).toHaveBeenCalled() // New debt created
  })
})

/**
 * Tests for the consumption code path - consuming from positive grant balances.
 * These tests verify:
 * - Grants are consumed in priority order
 * - Partial consumption from a single grant
 * - Consumption across multiple grants
 * - Correct tracking of fromPurchased credits
 * - Grant type handling (free, purchase, referral, admin, organization)
 */
describe('consumeFromOrderedGrants - consumption code path', () => {
  it('consumes partial amount from single grant', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 1000,
        balance: 800,
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 200,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(200)
    expect(result.fromPurchased).toBe(0) // Free grant, not purchased
    expect(mockLogger.warn).not.toHaveBeenCalled() // No debt created
  })

  it('consumes from multiple grants in order until satisfied', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: 50, // Will be fully consumed
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 200,
        balance: 150, // Will be partially consumed
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-3',
        user_id: 'user-1',
        org_id: null,
        type: 'referral' as const,
        principal: 100,
        balance: 100, // Should not be touched
        priority: 3,
        description: 'Referral credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100, // 50 from grant-1 + 50 from grant-2
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    expect(result.fromPurchased).toBe(50) // 50 from purchase grant
    expect(mockLogger.warn).not.toHaveBeenCalled() // No debt created
  })

  it('tracks fromPurchased correctly when consuming only from purchase grants', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 500,
        balance: 300,
        priority: 1,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 150,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(150)
    expect(result.fromPurchased).toBe(150) // All from purchase
  })

  it('tracks fromPurchased correctly when consuming from mixed grant types', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'admin' as const,
        principal: 100,
        balance: 30,
        priority: 1,
        description: 'Admin credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 200,
        balance: 100,
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-3',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: 50,
        priority: 3,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 150, // 30 admin + 100 purchase + 20 free
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(150)
    expect(result.fromPurchased).toBe(100) // Only the purchase grant counts
  })

  it('stops consuming when creditsToConsume is satisfied', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 1000,
        balance: 1000,
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 500,
        balance: 500,
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100, // Only 100 needed, grant-1 has 1000
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    expect(result.fromPurchased).toBe(0) // grant-2 not touched
  })

  it('skips grants with zero balance', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: 0, // Zero balance - should be skipped
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 200,
        balance: 100, // Should consume from here
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 50,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(50)
    expect(result.fromPurchased).toBe(50) // All from grant-2
  })

  it('consumes from multiple purchase grants and tracks total fromPurchased', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 100,
        balance: 60,
        priority: 1,
        description: 'Purchase 1',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 100,
        balance: 80,
        priority: 2,
        description: 'Purchase 2',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100, // 60 from grant-1 + 40 from grant-2
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    expect(result.fromPurchased).toBe(100) // All from purchase grants
  })

  it('consumes exact balance amount (boundary case)', async () => {
    const grants = [
      {
        operation_id: 'grant-1',
        user_id: 'user-1',
        org_id: null,
        type: 'free' as const,
        principal: 100,
        balance: 75,
        priority: 1,
        description: 'Free credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        user_id: 'user-1',
        org_id: null,
        type: 'purchase' as const,
        principal: 100,
        balance: 25,
        priority: 2,
        description: 'Purchased credits',
        expires_at: new Date('2099-12-31'),
        created_at: new Date(),
      },
    ]

    // Consume exactly the total available: 75 + 25 = 100
    const result = await consumeFromOrderedGrants({
      userId: 'user-1',
      creditsToConsume: 100,
      grants,
      tx: mockTx as any,
      logger: mockLogger as any,
    })

    expect(result.consumed).toBe(100)
    expect(result.fromPurchased).toBe(25)
    expect(mockLogger.warn).not.toHaveBeenCalled() // No debt - exact match
  })
})
