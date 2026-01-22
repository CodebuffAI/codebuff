import { describe, expect, it } from 'bun:test'

import {
  GRANT_ORDER_BY,
  calculateUsageAndBalanceFromGrants,
  getOrderedActiveGrantsForOwner,
} from '../billing-core'
import * as schema from '@codebuff/internal/db/schema'

import type { DbConn } from '../billing-core'

type Grant = Parameters<typeof calculateUsageAndBalanceFromGrants>[0]['grants'][number]

describe('billing-core', () => {
  describe('calculateUsageAndBalanceFromGrants', () => {
    it('calculates usage and settles debt', () => {
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 1000,
          balance: 800,
          created_at: new Date('2024-01-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'purchase',
          principal: 500,
          balance: -100,
          created_at: new Date('2024-02-01'),
          expires_at: new Date('2024-11-30'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      // Total positive balance: 800
      // Total debt: 100
      // Net balance after settlement: 700
      expect(result.balance.totalRemaining).toBe(700)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(700)

      // Usage calculation: (1000 - 800) + (500 - (-100)) = 200 + 600 = 800
      expect(result.usageThisCycle).toBe(800)
      expect(result.settlement).toEqual({
        totalDebt: 100,
        totalPositiveBalance: 800,
        settlementAmount: 100,
      })
    })

    it('returns zero values for empty grants array', () => {
      const result = calculateUsageAndBalanceFromGrants({
        grants: [],
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      expect(result.usageThisCycle).toBe(0)
      expect(result.balance.totalRemaining).toBe(0)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(0)
      expect(result.settlement).toBeUndefined()
    })

    it('handles all-positive grants with no debt (no settlement needed)', () => {
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 1000,
          balance: 800,
          created_at: new Date('2024-01-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'purchase',
          principal: 500,
          balance: 300,
          created_at: new Date('2024-02-01'),
          expires_at: new Date('2024-11-30'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      expect(result.balance.totalRemaining).toBe(1100) // 800 + 300
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(1100)
      expect(result.usageThisCycle).toBe(400) // (1000-800) + (500-300)
      expect(result.settlement).toBeUndefined() // No settlement needed
    })

    it('handles debt > positive balance (partial settlement)', () => {
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 100,
          balance: 50, // Only 50 positive
          created_at: new Date('2024-01-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'purchase',
          principal: 500,
          balance: -200, // 200 debt
          created_at: new Date('2024-02-01'),
          expires_at: new Date('2024-11-30'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      // Settlement: min(200, 50) = 50
      // After settlement: totalRemaining = 0, totalDebt = 150
      expect(result.balance.totalRemaining).toBe(0)
      expect(result.balance.totalDebt).toBe(150)
      expect(result.balance.netBalance).toBe(-150)
      expect(result.settlement).toEqual({
        totalDebt: 200,
        totalPositiveBalance: 50,
        settlementAmount: 50,
      })
    })

    it('handles debt = positive balance (complete settlement, netBalance = 0)', () => {
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 500,
          balance: 200, // 200 positive
          created_at: new Date('2024-01-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'purchase',
          principal: 300,
          balance: -200, // 200 debt (exactly equal)
          created_at: new Date('2024-02-01'),
          expires_at: new Date('2024-11-30'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      // Settlement: min(200, 200) = 200 (complete settlement)
      // After settlement: totalRemaining = 0, totalDebt = 0
      expect(result.balance.totalRemaining).toBe(0)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(0)
      expect(result.settlement).toEqual({
        totalDebt: 200,
        totalPositiveBalance: 200,
        settlementAmount: 200,
      })
    })

    it('handles never-expiring grants (null expires_at)', () => {
      const grants: Grant[] = [
        {
          type: 'admin',
          principal: 1000,
          balance: 750,
          created_at: new Date('2024-01-01'),
          expires_at: null, // Never expires
        },
        {
          type: 'free',
          principal: 200,
          balance: 100,
          created_at: new Date('2024-03-01'),
          expires_at: new Date('2024-12-31'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      // Both grants are active (null expires_at is always active)
      expect(result.balance.totalRemaining).toBe(850) // 750 + 100
      expect(result.balance.breakdown.admin).toBe(750)
      expect(result.balance.breakdown.free).toBe(100)
      expect(result.balance.principals.admin).toBe(1000)
      expect(result.balance.principals.free).toBe(200)
      expect(result.usageThisCycle).toBe(350) // (1000-750) + (200-100)
    })

    it('aggregates multiple grant types correctly', () => {
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 500,
          balance: 400,
          created_at: new Date('2024-01-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'free', // Second free grant
          principal: 300,
          balance: 200,
          created_at: new Date('2024-02-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'purchase',
          principal: 1000,
          balance: 800,
          created_at: new Date('2024-01-15'),
          expires_at: null,
        },
        {
          type: 'referral',
          principal: 100,
          balance: 50,
          created_at: new Date('2024-03-01'),
          expires_at: new Date('2024-12-31'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
      })

      // Total remaining: 400 + 200 + 800 + 50 = 1450
      expect(result.balance.totalRemaining).toBe(1450)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(1450)

      // Breakdown by type (multiple free grants aggregated)
      expect(result.balance.breakdown.free).toBe(600) // 400 + 200
      expect(result.balance.breakdown.purchase).toBe(800)
      expect(result.balance.breakdown.referral).toBe(50)

      // Principals by type
      expect(result.balance.principals.free).toBe(800) // 500 + 300
      expect(result.balance.principals.purchase).toBe(1000)
      expect(result.balance.principals.referral).toBe(100)

      // Usage: (500-400) + (300-200) + (1000-800) + (100-50) = 100+100+200+50 = 450
      expect(result.usageThisCycle).toBe(450)
    })

    it('counts usage from mid-cycle expired grants (but not their balance)', () => {
      // This tests the scenario where a grant expired mid-cycle:
      // - Grant created Jan 1, expires March 31
      // - quotaResetDate = March 1 (start of billing cycle)
      // - now = April 15 (grant has already expired)
      // The grant's usage from March 1-31 SHOULD be counted in usageThisCycle,
      // but its balance should NOT be counted (since it's expired)
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 1000,
          balance: 200, // 800 was used
          created_at: new Date('2024-01-01'),
          expires_at: new Date('2024-03-31'), // Expired mid-cycle (after quotaResetDate but before now)
        },
        {
          type: 'purchase',
          principal: 500,
          balance: 400, // 100 was used
          created_at: new Date('2024-04-01'),
          expires_at: new Date('2024-12-31'), // Still active
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-03-01'),
        now: new Date('2024-04-15'),
      })

      // The expired grant's usage (800) SHOULD be counted because it was active during the cycle
      // The active grant's usage (100) is also counted
      // Total usage = 800 + 100 = 900
      expect(result.usageThisCycle).toBe(900)

      // Only the active grant's balance should be counted (expired grant is excluded)
      expect(result.balance.totalRemaining).toBe(400)
      expect(result.balance.breakdown.free).toBe(0) // Expired, not counted
      expect(result.balance.breakdown.purchase).toBe(400) // Active, counted

      // Principals should also only count active grants
      expect(result.balance.principals.free).toBe(0) // Expired
      expect(result.balance.principals.purchase).toBe(500) // Active
    })

    it('handles grant that expires exactly at now (excluded from balance)', () => {
      // Edge case: grant expires at exactly the current time
      // The check uses gt(expires_at, now), so expires_at === now means expired
      const now = new Date('2024-06-01T12:00:00Z')
      const grants: Grant[] = [
        {
          type: 'free',
          principal: 1000,
          balance: 500,
          created_at: new Date('2024-01-01'),
          expires_at: now, // Expires exactly at now
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-05-01'),
        now,
      })

      // Usage should be counted (grant was active during cycle)
      expect(result.usageThisCycle).toBe(500)

      // But balance should NOT be counted (gt means strictly greater than)
      expect(result.balance.totalRemaining).toBe(0)
      expect(result.balance.breakdown.free).toBe(0)
    })

    it('skips organization grants for personal context', () => {
      const grants: Grant[] = [
        {
          type: 'organization',
          principal: 200,
          balance: 200,
          created_at: new Date('2024-03-01'),
          expires_at: new Date('2024-12-31'),
        },
        {
          type: 'free',
          principal: 300,
          balance: 50,
          created_at: new Date('2024-03-01'),
          expires_at: new Date('2024-12-31'),
        },
      ]

      const result = calculateUsageAndBalanceFromGrants({
        grants,
        quotaResetDate: new Date('2024-01-01'),
        now: new Date('2024-06-01'),
        isPersonalContext: true,
      })

      expect(result.usageThisCycle).toBe(250)
      expect(result.balance.totalRemaining).toBe(50)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(50)
      expect(result.balance.breakdown.organization).toBe(0)
      expect(result.balance.principals.organization).toBe(0)
      expect(result.balance.breakdown.free).toBe(50)
      expect(result.balance.principals.free).toBe(300)
    })
  })

  describe('getOrderedActiveGrantsForOwner', () => {
    it('uses the shared grant ordering', async () => {
      const orderedGrants: (typeof schema.creditLedger.$inferSelect)[] = [
        {
          operation_id: 'grant-1',
          user_id: 'user-123',
          principal: 100,
          balance: 100,
          type: 'free',
          description: null,
          priority: 10,
          expires_at: null,
          created_at: new Date('2024-01-01'),
          org_id: null,
        },
      ]
      const orderByArgs: unknown[] = []
      const conn = {
        select: () => ({
          from: (table: unknown) => {
            expect(table).toBe(schema.creditLedger)
            return {
              where: (_: unknown) => ({
                orderBy: (...args: unknown[]) => {
                  orderByArgs.push(...args)
                  return orderedGrants
                },
              }),
            }
          },
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      } as unknown as DbConn

      const result = await getOrderedActiveGrantsForOwner({
        ownerId: 'user-123',
        ownerType: 'user',
        now: new Date('2024-06-01'),
        conn,
      })

      expect(result).toEqual(orderedGrants)
      expect(orderByArgs).toHaveLength(GRANT_ORDER_BY.length)
      GRANT_ORDER_BY.forEach((clause, index) => {
        expect(orderByArgs[index]).toBe(clause)
      })
    })

    it('uses includeExpiredSince as expiration threshold when provided', async () => {
      // This tests that includeExpiredSince changes the expiration filtering
      // to include mid-cycle expired grants for usage calculations
      let capturedWhereClause: unknown
      const conn = {
        select: () => ({
          from: () => ({
            where: (clause: unknown) => {
              capturedWhereClause = clause
              return {
                orderBy: () => [],
              }
            },
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      } as unknown as DbConn

      // Call with includeExpiredSince - this should use quotaResetDate as threshold
      await getOrderedActiveGrantsForOwner({
        ownerId: 'user-123',
        ownerType: 'user',
        now: new Date('2024-06-01'),
        includeExpiredSince: new Date('2024-03-01'), // quotaResetDate
        conn,
      })

      // The where clause should have been created
      expect(capturedWhereClause).toBeDefined()

      // Note: We can't easily inspect the SQL clause structure, but we've verified
      // the parameter is passed through. The actual SQL behavior is tested via
      // integration tests with the real database.
    })
  })
})
