import type { CreditBalance } from '@codebuff/billing'
import { checkAndTriggerAutoTopup } from '@codebuff/billing'
import * as billing from '@codebuff/billing'
import { beforeEach, describe, expect, it, mock, afterEach, spyOn } from 'bun:test'

describe('Auto Top-up System', () => {
  describe('checkAndTriggerAutoTopup', () => {
    // Create fresh mocks for each test
    let dbMock: ReturnType<typeof mock>
    let balanceMock: ReturnType<typeof mock>
    let paymentMethodsMock: ReturnType<typeof mock>
    let paymentIntentMock: ReturnType<typeof mock>
    let grantCreditsMock: ReturnType<typeof mock>

    beforeEach(() => {
      // Clear previous mocks and set up logger again
      mock.restore()

      mock.module('../util/logger', () => ({
        logger: {
          debug: () => {},
          error: () => {},
          info: () => {},
          warn: () => {},
        },
        withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
      }))

      dbMock = mock(() => ({
        id: 'test-user',
        stripe_customer_id: 'cus_123',
        auto_topup_enabled: true,
        auto_topup_threshold: 100,
        auto_topup_amount: 500,
        next_quota_reset: new Date(),
      }))

      balanceMock = mock(() =>
        Promise.resolve({
          usageThisCycle: 0,
          balance: {
            totalRemaining: 50, // Below threshold by default
            totalDebt: 0,
            netBalance: 50,
            breakdown: {},
          } as CreditBalance,
        })
      )

      paymentMethodsMock = mock(() =>
        Promise.resolve({
          data: [
            {
              id: 'pm_123',
              card: {
                exp_year: 2025,
                exp_month: 12,
              },
            },
          ],
        })
      )

      paymentIntentMock = mock(() =>
        Promise.resolve({
          status: 'succeeded',
          id: 'pi_123',
        })
      )

      grantCreditsMock = mock(() => Promise.resolve())

      // Set up module mocks with fresh mocks
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
      spyOn(billing, 'processAndGrantCredit').mockImplementation(grantCreditsMock)

      mock.module('common/src/util/stripe', () => ({
        stripeServer: {
          paymentMethods: {
            list: paymentMethodsMock,
          },
          paymentIntents: {
            create: paymentIntentMock,
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

      // Should create payment intent
      expect(paymentIntentMock).toHaveBeenCalled()

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
      spyOn(billing, 'processAndGrantCredit').mockImplementation(grantCreditsMock)

      await checkAndTriggerAutoTopup('test-user')

      // Should still check settings and balance
      expect(dbMock).toHaveBeenCalled()
      expect(balanceMock).toHaveBeenCalled()

      // But should not create payment or grant credits
      expect(paymentIntentMock.mock.calls.length).toBe(0)
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
      spyOn(billing, 'processAndGrantCredit').mockImplementation(grantCreditsMock)

      await checkAndTriggerAutoTopup('test-user')

      // Should grant credits
      expect(grantCreditsMock).toHaveBeenCalled()
      // Check the amount is correct (600 to cover debt)
      expect(grantCreditsMock.mock.calls[0]?.[1]).toBe(600)
    })

    it('should disable auto-topup when payment fails', async () => {
      // Set up payment failure mock
      paymentIntentMock = mock(() =>
        Promise.resolve({
          status: 'requires_payment_method',
        })
      )

      // Update the module mock
      mock.module('common/src/util/stripe', () => ({
        stripeServer: {
          paymentMethods: {
            list: paymentMethodsMock,
          },
          paymentIntents: {
            create: paymentIntentMock,
          },
        },
      }))

      await expect(checkAndTriggerAutoTopup('test-user')).rejects.toThrow()
    })

    afterEach(() => {
      mock.restore()
    })
  })
})
