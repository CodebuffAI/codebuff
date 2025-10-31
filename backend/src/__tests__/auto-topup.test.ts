import * as billing from '@codebuff/billing'
import { checkAndTriggerAutoTopup } from '@codebuff/billing'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('Auto Top-up System', () => {
  describe('checkAndTriggerAutoTopup', () => {
    // Create fresh mocks for each test
    let dbMock: ReturnType<typeof mock>
    let balanceMock: ReturnType<typeof mock>
    let validateAutoTopupMock: ReturnType<typeof mock>
    let grantCreditsMock: ReturnType<typeof mock>
    const logger: Logger = {
      debug: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    }

    beforeAll(async () => {
      // Set up default mocks
      dbMock = mock(() =>
        Promise.resolve({
          auto_topup_enabled: true,
          auto_topup_threshold: 100,
          auto_topup_amount: 500,
          stripe_customer_id: 'cus_123',
          next_quota_reset: new Date(),
        }),
      )

      // Mock the database
      await mockModule('@codebuff/internal/db', () => ({
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

      // Mock Stripe payment intent creation
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentIntents: {
            create: mock(() =>
              Promise.resolve({
                status: 'succeeded',
                id: 'pi_123',
              }),
            ),
          },
        },
      }))
    })

    beforeEach(() => {
      balanceMock = mock(() =>
        Promise.resolve({
          usageThisCycle: 0,
          balance: {
            totalRemaining: 50, // Below threshold
            totalDebt: 0,
            netBalance: 50,
            breakdown: {},
          },
        }),
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
        }),
      )

      grantCreditsMock = mock(() => Promise.resolve())

      spyOn(billing, 'calculateUsageAndBalance').mockImplementation(balanceMock)
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock,
      )
      spyOn(billing, 'processAndGrantCredit').mockImplementation(
        grantCreditsMock,
      )
    })

    afterEach(() => {
      mock.restore()
    })

    afterAll(() => {
      clearMockedModules()
    })

    it('should trigger top-up when balance below threshold', async () => {
      // Replace direct call with capture of returned amount
      const amount = await checkAndTriggerAutoTopup({
        userId: 'test-user',
        logger,
      })

      // Should check user settings
      expect(dbMock).toHaveBeenCalled()

      // Should check balance
      expect(balanceMock).toHaveBeenCalled()

      // Should validate auto top-up status
      expect(validateAutoTopupMock).toHaveBeenCalled()

      // Assert the top-up amount was as configured (500)
      expect(amount).toBe(500)
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
        }),
      )

      // Update the spies with the new mock implementations
      spyOn(billing, 'calculateUsageAndBalance').mockImplementation(balanceMock)
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock,
      )
      spyOn(billing, 'processAndGrantCredit').mockImplementation(
        grantCreditsMock,
      )

      // Capture return value (should be undefined)
      const amount = await checkAndTriggerAutoTopup({
        userId: 'test-user',
        logger,
      })

      // Should still check settings and balance
      expect(dbMock).toHaveBeenCalled()
      expect(balanceMock).toHaveBeenCalled()

      // Should not validate auto top-up when not needed
      expect(validateAutoTopupMock.mock.calls.length).toBe(0)

      // No top-up triggered
      expect(amount).toBeUndefined()
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
        }),
      )

      // Update the spies with the new mock implementations
      spyOn(billing, 'calculateUsageAndBalance').mockImplementation(balanceMock)
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock,
      )
      spyOn(billing, 'processAndGrantCredit').mockImplementation(
        grantCreditsMock,
      )

      // Capture the returned amount and assert debt coverage
      const amount = await checkAndTriggerAutoTopup({
        userId: 'test-user',
        logger,
      })

      expect(amount).toBe(600)
    })

    it('should disable auto-topup when validation fails', async () => {
      // Set up validation failure mock
      validateAutoTopupMock = mock(() =>
        Promise.resolve({
          blockedReason: 'No valid payment method found',
          validPaymentMethod: null,
        }),
      )

      // Update the spy with the new mock implementation
      spyOn(billing, 'validateAutoTopupStatus').mockImplementation(
        validateAutoTopupMock,
      )

      await expect(
        checkAndTriggerAutoTopup({
          userId: 'test-user',
          logger,
        }),
      ).rejects.toThrow('No valid payment method found')

      // Should have called validation
      expect(validateAutoTopupMock).toHaveBeenCalled()
    })

    afterEach(() => {
      mock.restore()
    })
  })
})
