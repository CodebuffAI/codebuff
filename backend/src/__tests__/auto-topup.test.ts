import type { CreditBalance } from '@codebuff/billing'
import { checkAndTriggerAutoTopup } from '@codebuff/billing'
import * as billing from '@codebuff/billing'
import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  afterEach,
  spyOn,
} from 'bun:test'

describe('Auto Top-up System', () => {
  describe('checkAndTriggerAutoTopup', () => {
    // Create fresh mocks for each test
    let dbMock: ReturnType<typeof mock>
    let balanceMock: ReturnType<typeof mock>
    let validateAutoTopupMock: ReturnType<typeof mock>
    let grantCreditsMock: ReturnType<typeof mock>

    beforeEach(() => {
      // Set up default mocks
      dbMock = mock(() =>
        Promise.resolve({
          auto_topup_enabled: true,
          auto_topup_threshold: 100,
          auto_topup_amount: 500,
          stripe_customer_id: 'cus_123',
          next_quota_reset: new Date(),
        })
      )

      balanceMock = mock(() =>
        Promise.resolve({
          usageThisCycle: 0,
          balance: {
            totalRemaining: 50, // Below threshold
            totalDebt: 0,
            netBalance: 50,
            breakdown: {},
          },
        })
      )

      validateAutoTopupMock = mock(() =>
        Promise.resolve({
          blockedReason: null,
          validPaymentMethod: {
            id: 'pm_123',
            type: 'card',
            card: {
              exp_year: 2030,
              exp_month: 12,
            },
          },
        })
      )

      grantCreditsMock = mock(() => Promise.resolve())

      // Mock the database
      mock.module('common/db', () => ({
        default: {
          query: {
            user: {
              findFirst: dbMock,
            },
          },
          update: mock(() => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          })),
        },
      }))

      spyOn(billing, 'calculateUsageAndBalance').mockImplementation(balanceMock)
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock
      )
      spyOn(billing, 'processAndGrantCredit').mockImplementation(
        grantCreditsMock
      )

      // Mock Stripe payment intent creation
      mock.module('common/src/util/stripe', () => ({
        stripeServer: {
          paymentIntents: {
            create: mock(() =>
              Promise.resolve({
                status: 'succeeded',
                id: 'pi_123',
              })
            ),
          },
        },
      }))
    })

    it('should trigger top-up when balance below threshold', async () => {
      await checkAndTriggerAutoTopup('test-user')

      // Should check user settings
      expect(dbMock).toHaveBeenCalled()

      // Should check balance
      expect(balanceMock).toHaveBeenCalled()

      // Should validate auto top-up status
      expect(validateAutoTopupMock).toHaveBeenCalled()

      // Should grant credits
      expect(grantCreditsMock).toHaveBeenCalled()
    })

    it('should not trigger top-up when balance above threshold', async () => {
      // Set up balance mock before the test
      balanceMock = mock(() =>
        Promise.resolve({
          usageThisCycle: 0,
          balance: {
            totalRemaining: 200, // Above threshold
            totalDebt: 0,
            netBalance: 200,
            breakdown: {},
          },
        })
      )

      // Update the spies with the new mock implementations
      spyOn(billing, 'calculateUsageAndBalance').mockImplementation(balanceMock)
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock
      )
      spyOn(billing, 'processAndGrantCredit').mockImplementation(
        grantCreditsMock
      )

      await checkAndTriggerAutoTopup('test-user')

      // Should still check settings and balance
      expect(dbMock).toHaveBeenCalled()
      expect(balanceMock).toHaveBeenCalled()

      // Should still validate auto top-up (this happens before balance check)
      expect(validateAutoTopupMock.mock.calls.length).toBe(0)

      // But should not grant credits
      expect(grantCreditsMock.mock.calls.length).toBe(0)
    })

    it('should handle debt by topping up max(debt, configured amount)', async () => {
      // Set up balance mock before the test
      balanceMock = mock(() =>
        Promise.resolve({
          usageThisCycle: 0,
          balance: {
            totalRemaining: 0,
            totalDebt: 600, // More than configured amount
            netBalance: -600,
            breakdown: {},
          },
        })
      )

      // Update the spies with the new mock implementations
      spyOn(billing, 'calculateUsageAndBalance').mockImplementation(balanceMock)
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock
      )
      spyOn(billing, 'processAndGrantCredit').mockImplementation(
        grantCreditsMock
      )

      await checkAndTriggerAutoTopup('test-user')

      // Should grant credits
      expect(grantCreditsMock).toHaveBeenCalled()
      // Check the amount is correct (600 to cover debt)
      expect(grantCreditsMock.mock.calls[0]?.[1]).toBe(600)
    })

    it('should disable auto-topup when validation fails', async () => {
      // Set up validation failure mock
      validateAutoTopupMock = mock(() =>
        Promise.resolve({
          blockedReason: 'No valid payment method found',
          validPaymentMethod: null,
        })
      )

      // Update the spy with the new mock implementation
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock
      )

      await expect(checkAndTriggerAutoTopup('test-user')).rejects.toThrow(
        'No valid payment method found'
      )

      // Should have called validation
      expect(validateAutoTopupMock).toHaveBeenCalled()

      // Should not grant credits
      expect(grantCreditsMock.mock.calls.length).toBe(0)
    })

    afterEach(() => {
      mock.restore()
    })
  })
})
