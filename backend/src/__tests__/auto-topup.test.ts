import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { checkAndTriggerAutoTopup } from 'common/src/billing/auto-topup'
import { CreditBalance } from 'common/src/billing/balance-calculator'
import { debugLog } from '../util/debug'

describe('Auto Top-up System', () => {
  describe('checkAndTriggerAutoTopup', () => {
    // Create fresh mocks for each test
    let dbMock: ReturnType<typeof mock>
    let balanceMock: ReturnType<typeof mock>
    let paymentMethodsMock: ReturnType<typeof mock>
    let paymentIntentMock: ReturnType<typeof mock>
    let grantCreditsMock: ReturnType<typeof mock>

    beforeEach(() => {
      debugLog('Setting up test mocks...')
      
      // Reset mocks before each test
      dbMock = mock(() => ({
        id: 'test-user',
        stripe_customer_id: 'cus_123',
        auto_topup_enabled: true,
        auto_topup_threshold: 100,
        auto_topup_amount: 500,
        next_quota_reset: new Date('2024-01-01T00:00:00Z'), // Fixed UTC date
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

      // Set up module mocks with correct paths matching imports
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

      mock.module('common/src/billing/balance-calculator', () => ({
        calculateUsageAndBalance: balanceMock,
      }))

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

      mock.module('common/src/billing/grant-credits', () => ({
        processAndGrantCredit: grantCreditsMock,
      }))

      // Mock the env import
      mock.module('src/env.mjs', () => ({
        env: {
          NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        },
      }))

      debugLog('Mocks configured successfully')
    })

    it('should trigger top-up when balance below threshold', async () => {
      try {
        debugLog('Starting test: trigger top-up when balance below threshold')
        await checkAndTriggerAutoTopup('test-user')

        // Should check user settings
        expect(dbMock).toHaveBeenCalled()
        debugLog('User settings checked')

        // Should check balance
        expect(balanceMock).toHaveBeenCalled()
        debugLog('Balance checked')

        // Should create payment intent
        expect(paymentIntentMock).toHaveBeenCalled()
        debugLog('Payment intent created')

        // Should grant credits
        expect(grantCreditsMock).toHaveBeenCalled()
        debugLog('Credits granted')
      } catch (error) {
        debugLog('Test failed with error:', error)
        throw error
      }
    })

    it('should not trigger top-up when balance above threshold', async () => {
      try {
        debugLog('Starting test: no top-up when balance above threshold')
        
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

        // Update the module mock
        mock.module('common/src/billing/balance-calculator', () => ({
          calculateUsageAndBalance: balanceMock,
        }))

        await checkAndTriggerAutoTopup('test-user')

        // Should still check settings and balance
        expect(dbMock).toHaveBeenCalled()
        expect(balanceMock).toHaveBeenCalled()
        debugLog('Settings and balance checked')

        // But should not create payment or grant credits
        expect(paymentIntentMock.mock.calls.length).toBe(0)
        expect(grantCreditsMock.mock.calls.length).toBe(0)
        debugLog('Verified no payment or credits were granted')
      } catch (error) {
        debugLog('Test failed with error:', error)
        throw error
      }
    })

    it('should handle debt by topping up max(debt, configured amount)', async () => {
      try {
        debugLog('Starting test: handle debt with max amount')
        
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

        // Update the module mock
        mock.module('common/src/billing/balance-calculator', () => ({
          calculateUsageAndBalance: balanceMock,
        }))

        await checkAndTriggerAutoTopup('test-user')

        // Should grant credits
        expect(grantCreditsMock).toHaveBeenCalled()
        // Check the amount is correct (600 to cover debt)
        expect(grantCreditsMock.mock.calls[0]?.[1]).toBe(600)
        debugLog('Verified correct credit amount granted for debt')
      } catch (error) {
        debugLog('Test failed with error:', error)
        throw error
      }
    })

    it('should disable auto-topup when payment fails', async () => {
      try {
        debugLog('Starting test: disable auto-topup on payment failure')
        
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
        debugLog('Verified payment failure handling')
      } catch (error) {
        debugLog('Test failed with error:', error)
        throw error
      }
    })
  })
})