import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  createPaymentIntent,
  fetchPaymentMethods,
  filterValidPaymentMethods,
  findValidPaymentMethod,
  getOrSetDefaultPaymentMethod,
  isValidPaymentMethod,
} from '../auto-topup-helpers'

import type { Logger } from '@codebuff/common/types/contracts/logger'

import type Stripe from 'stripe'

/**
 * Creates a mock Stripe card payment method for testing.
 */
function createCardPaymentMethod(
  id: string,
  expYear: number | undefined,
  expMonth: number | undefined,
): Stripe.PaymentMethod {
  return {
    id,
    type: 'card',
    card:
      expYear !== undefined && expMonth !== undefined
        ? { exp_year: expYear, exp_month: expMonth }
        : expYear !== undefined
          ? { exp_year: expYear }
          : expMonth !== undefined
            ? { exp_month: expMonth }
            : undefined,
  } as Stripe.PaymentMethod
}

/**
 * Creates a mock Stripe link payment method for testing.
 */
function createLinkPaymentMethod(id: string): Stripe.PaymentMethod {
  return {
    id,
    type: 'link',
  } as Stripe.PaymentMethod
}

/**
 * Creates a mock Stripe payment method with a specified type.
 */
function createPaymentMethodWithType(
  id: string,
  type: string,
): Stripe.PaymentMethod {
  return {
    id,
    type,
  } as Stripe.PaymentMethod
}

describe('auto-topup-helpers', () => {
  describe('fetchPaymentMethods', () => {
    let mockPaymentMethodsList: ReturnType<typeof createMockPaymentMethodsList>

    function createMockPaymentMethodsList(options?: {
      cards?: Stripe.PaymentMethod[]
      links?: Stripe.PaymentMethod[]
    }) {
      const cards = options?.cards ?? []
      const links = options?.links ?? []
      const calls: Array<{ customer: string; type: string }> = []

      return {
        calls,
        list: async (params: { customer: string; type: string }) => {
          calls.push({ customer: params.customer, type: params.type })
          if (params.type === 'card') {
            return { data: cards }
          }
          if (params.type === 'link') {
            return { data: links }
          }
          return { data: [] }
        },
      }
    }

    beforeEach(async () => {
      mockPaymentMethodsList = createMockPaymentMethodsList()
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))
    })

    afterEach(() => {
      clearMockedModules()
    })

    it('should return combined card and link payment methods', async () => {
      const card1 = createCardPaymentMethod('pm_card_1', 2099, 12)
      const card2 = createCardPaymentMethod('pm_card_2', 2050, 6)
      const link1 = createLinkPaymentMethod('pm_link_1')

      mockPaymentMethodsList = createMockPaymentMethodsList({
        cards: [card1, card2],
        links: [link1],
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))

      const result = await fetchPaymentMethods('cus_123')

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('pm_card_1')
      expect(result[1].id).toBe('pm_card_2')
      expect(result[2].id).toBe('pm_link_1')
    })

    it('should return empty array when customer has no payment methods', async () => {
      mockPaymentMethodsList = createMockPaymentMethodsList({
        cards: [],
        links: [],
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))

      const result = await fetchPaymentMethods('cus_456')

      expect(result).toEqual([])
    })

    it('should return only cards when no link methods exist', async () => {
      const card1 = createCardPaymentMethod('pm_card_1', 2099, 12)
      const card2 = createCardPaymentMethod('pm_card_2', 2050, 6)

      mockPaymentMethodsList = createMockPaymentMethodsList({
        cards: [card1, card2],
        links: [],
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))

      const result = await fetchPaymentMethods('cus_789')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('pm_card_1')
      expect(result[1].id).toBe('pm_card_2')
    })

    it('should return only links when no card methods exist', async () => {
      const link1 = createLinkPaymentMethod('pm_link_1')
      const link2 = createLinkPaymentMethod('pm_link_2')

      mockPaymentMethodsList = createMockPaymentMethodsList({
        cards: [],
        links: [link1, link2],
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))

      const result = await fetchPaymentMethods('cus_abc')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('pm_link_1')
      expect(result[1].id).toBe('pm_link_2')
    })

    it('should call Stripe API with correct customer ID and payment method types', async () => {
      const card = createCardPaymentMethod('pm_card', 2099, 12)
      const link = createLinkPaymentMethod('pm_link')

      mockPaymentMethodsList = createMockPaymentMethodsList({
        cards: [card],
        links: [link],
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))

      await fetchPaymentMethods('cus_test_customer')

      expect(mockPaymentMethodsList.calls).toHaveLength(2)
      expect(mockPaymentMethodsList.calls).toContainEqual({
        customer: 'cus_test_customer',
        type: 'card',
      })
      expect(mockPaymentMethodsList.calls).toContainEqual({
        customer: 'cus_test_customer',
        type: 'link',
      })
    })

    it('should preserve order with cards first then links', async () => {
      const card1 = createCardPaymentMethod('pm_card_1', 2099, 12)
      const link1 = createLinkPaymentMethod('pm_link_1')
      const card2 = createCardPaymentMethod('pm_card_2', 2050, 6)
      const link2 = createLinkPaymentMethod('pm_link_2')

      mockPaymentMethodsList = createMockPaymentMethodsList({
        cards: [card1, card2],
        links: [link1, link2],
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentMethods: mockPaymentMethodsList,
        },
      }))

      const result = await fetchPaymentMethods('cus_order')

      expect(result.map((pm) => pm.id)).toEqual([
        'pm_card_1',
        'pm_card_2',
        'pm_link_1',
        'pm_link_2',
      ])
    })
  })

  describe('createPaymentIntent', () => {
    let mockPaymentIntentsCreate: {
      calls: Array<{ params: any; options: any }>
      create: (params: any, options?: any) => Promise<any>
      mockResponse: any
      mockError: Error | null
    }

    function createMockPaymentIntentsCreate(options?: {
      response?: any
      error?: Error
    }) {
      const calls: Array<{ params: any; options: any }> = []
      const mockResponse = options?.response ?? {
        id: 'pi_test_123',
        status: 'succeeded',
        amount: 1000,
        currency: 'usd',
      }
      const mockError = options?.error ?? null

      return {
        calls,
        mockResponse,
        mockError,
        create: async (params: any, opts?: any) => {
          calls.push({ params, options: opts })
          if (mockError) {
            throw mockError
          }
          return mockResponse
        },
      }
    }

    beforeEach(async () => {
      mockPaymentIntentsCreate = createMockPaymentIntentsCreate()
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentIntents: mockPaymentIntentsCreate,
        },
      }))
    })

    afterEach(() => {
      clearMockedModules()
    })

    it('should create a payment intent with correct parameters', async () => {
      const params = {
        amountInCents: 5000,
        stripeCustomerId: 'cus_123',
        paymentMethodId: 'pm_card_123',
        description: 'Auto top-up for user',
        idempotencyKey: 'idem_key_123',
        metadata: { userId: 'user_123', type: 'auto_topup' },
      }

      await createPaymentIntent(params)

      expect(mockPaymentIntentsCreate.calls).toHaveLength(1)
      const call = mockPaymentIntentsCreate.calls[0]

      expect(call.params).toEqual({
        amount: 5000,
        currency: 'usd',
        customer: 'cus_123',
        payment_method: 'pm_card_123',
        off_session: true,
        confirm: true,
        description: 'Auto top-up for user',
        metadata: { userId: 'user_123', type: 'auto_topup' },
      })
      expect(call.options).toEqual({ idempotencyKey: 'idem_key_123' })
    })

    it('should return the payment intent from Stripe', async () => {
      const expectedResponse = {
        id: 'pi_custom_123',
        status: 'succeeded',
        amount: 10000,
        currency: 'usd',
        customer: 'cus_456',
      } as Stripe.PaymentIntent

      mockPaymentIntentsCreate = createMockPaymentIntentsCreate({
        response: expectedResponse,
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentIntents: mockPaymentIntentsCreate,
        },
      }))

      const result = await createPaymentIntent({
        amountInCents: 10000,
        stripeCustomerId: 'cus_456',
        paymentMethodId: 'pm_card_456',
        description: 'Test payment',
        idempotencyKey: 'idem_456',
        metadata: {},
      })

      expect(result.id).toBe('pi_custom_123')
      expect(result.status).toBe('succeeded')
      expect(result.amount).toBe(10000)
    })

    it('should always set currency to usd', async () => {
      await createPaymentIntent({
        amountInCents: 1000,
        stripeCustomerId: 'cus_test',
        paymentMethodId: 'pm_test',
        description: 'Test',
        idempotencyKey: 'idem_test',
        metadata: {},
      })

      expect(mockPaymentIntentsCreate.calls[0].params.currency).toBe('usd')
    })

    it('should always set off_session to true for auto-topup', async () => {
      await createPaymentIntent({
        amountInCents: 1000,
        stripeCustomerId: 'cus_test',
        paymentMethodId: 'pm_test',
        description: 'Test',
        idempotencyKey: 'idem_test',
        metadata: {},
      })

      expect(mockPaymentIntentsCreate.calls[0].params.off_session).toBe(true)
    })

    it('should always set confirm to true to immediately charge', async () => {
      await createPaymentIntent({
        amountInCents: 1000,
        stripeCustomerId: 'cus_test',
        paymentMethodId: 'pm_test',
        description: 'Test',
        idempotencyKey: 'idem_test',
        metadata: {},
      })

      expect(mockPaymentIntentsCreate.calls[0].params.confirm).toBe(true)
    })

    it('should pass idempotency key in options for safe retries', async () => {
      const idempotencyKey = 'unique_idem_key_789'

      await createPaymentIntent({
        amountInCents: 1000,
        stripeCustomerId: 'cus_test',
        paymentMethodId: 'pm_test',
        description: 'Test',
        idempotencyKey,
        metadata: {},
      })

      expect(mockPaymentIntentsCreate.calls[0].options.idempotencyKey).toBe(
        idempotencyKey,
      )
    })

    it('should pass metadata to Stripe', async () => {
      const metadata = {
        userId: 'user_123',
        organizationId: 'org_456',
        type: 'auto_topup',
        trigger: 'low_balance',
      }

      await createPaymentIntent({
        amountInCents: 1000,
        stripeCustomerId: 'cus_test',
        paymentMethodId: 'pm_test',
        description: 'Test',
        idempotencyKey: 'idem_test',
        metadata,
      })

      expect(mockPaymentIntentsCreate.calls[0].params.metadata).toEqual(metadata)
    })

    it('should propagate Stripe errors', async () => {
      const stripeError = new Error('Card declined')

      mockPaymentIntentsCreate = createMockPaymentIntentsCreate({
        error: stripeError,
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          paymentIntents: mockPaymentIntentsCreate,
        },
      }))

      await expect(
        createPaymentIntent({
          amountInCents: 1000,
          stripeCustomerId: 'cus_test',
          paymentMethodId: 'pm_declined',
          description: 'Test',
          idempotencyKey: 'idem_test',
          metadata: {},
        }),
      ).rejects.toThrow('Card declined')
    })

    it('should handle empty metadata', async () => {
      await createPaymentIntent({
        amountInCents: 1000,
        stripeCustomerId: 'cus_test',
        paymentMethodId: 'pm_test',
        description: 'Test',
        idempotencyKey: 'idem_test',
        metadata: {},
      })

      expect(mockPaymentIntentsCreate.calls[0].params.metadata).toEqual({})
    })
  })

  describe('isValidPaymentMethod', () => {
    describe('card payment methods', () => {
      it('should return true for card with future expiration date', () => {
        // Card expiring in December 2099 - definitely in the future
        const card = createCardPaymentMethod('pm_1', 2099, 12)
        expect(isValidPaymentMethod(card)).toBe(true)
      })

      it('should return true for card expiring many years in the future', () => {
        const card = createCardPaymentMethod('pm_1', 2050, 6)
        expect(isValidPaymentMethod(card)).toBe(true)
      })

      it('should return false for card that expired in the past', () => {
        // Card expired in January 2020 - definitely in the past
        const card = createCardPaymentMethod('pm_1', 2020, 1)
        expect(isValidPaymentMethod(card)).toBe(false)
      })

      it('should return false for card that expired years ago', () => {
        const card = createCardPaymentMethod('pm_1', 2015, 6)
        expect(isValidPaymentMethod(card)).toBe(false)
      })

      it('should return false for card expiring in current month', () => {
        // The logic uses > not >= so cards expiring this month are invalid
        // as the check creates a date at the START of the expiration month
        const now = new Date()
        const card = createCardPaymentMethod(
          'pm_1',
          now.getFullYear(),
          now.getMonth() + 1,
        )
        expect(isValidPaymentMethod(card)).toBe(false)
      })

      it('should return true for card expiring next month', () => {
        const now = new Date()
        // Handle year rollover
        const nextMonth = now.getMonth() + 2 // +2 because getMonth is 0-indexed but exp_month is 1-indexed
        const year =
          nextMonth > 12 ? now.getFullYear() + 1 : now.getFullYear()
        const month = nextMonth > 12 ? nextMonth - 12 : nextMonth
        const card = createCardPaymentMethod('pm_1', year, month)
        expect(isValidPaymentMethod(card)).toBe(true)
      })

      it('should return false for card with missing exp_year', () => {
        const card = createCardPaymentMethod('pm_1', undefined, 12)
        expect(isValidPaymentMethod(card)).toBe(false)
      })

      it('should return false for card with missing exp_month', () => {
        const card = createCardPaymentMethod('pm_1', 2099, undefined)
        expect(isValidPaymentMethod(card)).toBe(false)
      })

      it('should return false for card with missing card object', () => {
        const card = {
          id: 'pm_1',
          type: 'card',
          card: undefined,
        } as Stripe.PaymentMethod
        expect(isValidPaymentMethod(card)).toBe(false)
      })

      it('should return false for card with null card object', () => {
        const card = {
          id: 'pm_1',
          type: 'card',
          card: null,
        } as unknown as Stripe.PaymentMethod
        expect(isValidPaymentMethod(card)).toBe(false)
      })
    })

    describe('link payment methods', () => {
      it('should return true for link payment method', () => {
        const link = createLinkPaymentMethod('pm_link_1')
        expect(isValidPaymentMethod(link)).toBe(true)
      })

      it('should return true for any link payment method regardless of other properties', () => {
        const link = {
          id: 'pm_link_2',
          type: 'link',
          link: { email: 'test@example.com' },
        } as Stripe.PaymentMethod
        expect(isValidPaymentMethod(link)).toBe(true)
      })
    })

    describe('other payment method types', () => {
      it('should return false for sepa_debit payment method', () => {
        const sepa = createPaymentMethodWithType('pm_sepa_1', 'sepa_debit')
        expect(isValidPaymentMethod(sepa)).toBe(false)
      })

      it('should return false for us_bank_account payment method', () => {
        const bank = createPaymentMethodWithType('pm_bank_1', 'us_bank_account')
        expect(isValidPaymentMethod(bank)).toBe(false)
      })

      it('should return false for acss_debit payment method', () => {
        const acss = createPaymentMethodWithType('pm_acss_1', 'acss_debit')
        expect(isValidPaymentMethod(acss)).toBe(false)
      })

      it('should return false for unknown payment method type', () => {
        const unknown = createPaymentMethodWithType('pm_unknown', 'unknown_type')
        expect(isValidPaymentMethod(unknown)).toBe(false)
      })

      it('should return false for empty type string', () => {
        const empty = createPaymentMethodWithType('pm_empty', '')
        expect(isValidPaymentMethod(empty)).toBe(false)
      })
    })
  })

  describe('filterValidPaymentMethods', () => {
    it('should return empty array for empty input', () => {
      const result = filterValidPaymentMethods([])
      expect(result).toEqual([])
    })

    it('should return all payment methods when all are valid', () => {
      const validCard = createCardPaymentMethod('pm_card_1', 2099, 12)
      const validLink = createLinkPaymentMethod('pm_link_1')
      const validCard2 = createCardPaymentMethod('pm_card_2', 2050, 6)

      const result = filterValidPaymentMethods([validCard, validLink, validCard2])

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('pm_card_1')
      expect(result[1].id).toBe('pm_link_1')
      expect(result[2].id).toBe('pm_card_2')
    })

    it('should return empty array when all payment methods are invalid', () => {
      const expiredCard1 = createCardPaymentMethod('pm_expired_1', 2020, 1)
      const expiredCard2 = createCardPaymentMethod('pm_expired_2', 2015, 6)
      const sepa = createPaymentMethodWithType('pm_sepa_1', 'sepa_debit')

      const result = filterValidPaymentMethods([expiredCard1, expiredCard2, sepa])

      expect(result).toEqual([])
    })

    it('should filter out invalid payment methods from mixed list', () => {
      const validCard = createCardPaymentMethod('pm_valid_card', 2099, 12)
      const expiredCard = createCardPaymentMethod('pm_expired', 2020, 1)
      const validLink = createLinkPaymentMethod('pm_link')
      const sepa = createPaymentMethodWithType('pm_sepa', 'sepa_debit')
      const validCard2 = createCardPaymentMethod('pm_valid_card_2', 2050, 6)

      const result = filterValidPaymentMethods([
        validCard,
        expiredCard,
        validLink,
        sepa,
        validCard2,
      ])

      expect(result).toHaveLength(3)
      expect(result.map((pm) => pm.id)).toEqual([
        'pm_valid_card',
        'pm_link',
        'pm_valid_card_2',
      ])
    })

    it('should preserve the order of valid payment methods', () => {
      const link1 = createLinkPaymentMethod('pm_link_1')
      const card1 = createCardPaymentMethod('pm_card_1', 2099, 1)
      const link2 = createLinkPaymentMethod('pm_link_2')
      const card2 = createCardPaymentMethod('pm_card_2', 2099, 6)

      const result = filterValidPaymentMethods([link1, card1, link2, card2])

      expect(result.map((pm) => pm.id)).toEqual([
        'pm_link_1',
        'pm_card_1',
        'pm_link_2',
        'pm_card_2',
      ])
    })

    it('should handle single valid payment method', () => {
      const validCard = createCardPaymentMethod('pm_single', 2099, 12)

      const result = filterValidPaymentMethods([validCard])

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('pm_single')
    })

    it('should handle single invalid payment method', () => {
      const expiredCard = createCardPaymentMethod('pm_expired', 2020, 1)

      const result = filterValidPaymentMethods([expiredCard])

      expect(result).toEqual([])
    })

    it('should not mutate the original array', () => {
      const validCard = createCardPaymentMethod('pm_valid', 2099, 12)
      const expiredCard = createCardPaymentMethod('pm_expired', 2020, 1)
      const original = [validCard, expiredCard]
      const originalLength = original.length

      filterValidPaymentMethods(original)

      expect(original).toHaveLength(originalLength)
      expect(original[0].id).toBe('pm_valid')
      expect(original[1].id).toBe('pm_expired')
    })
  })

  describe('getOrSetDefaultPaymentMethod', () => {
    let mockCustomersRetrieve: {
      calls: Array<string>
      retrieve: (customerId: string) => Promise<any>
      mockCustomer: any
    }
    let mockCustomersUpdate: {
      calls: Array<{ customerId: string; params: any }>
      update: (customerId: string, params: any) => Promise<any>
      mockError: Error | null
    }
    let mockLogger: Logger
    let loggerCalls: {
      debug: Array<{ context: any; message: string }>
      info: Array<{ context: any; message: string }>
      warn: Array<{ context: any; message: string }>
      error: Array<{ context: any; message: string }>
    }

    function createMockCustomersRetrieve(customer?: any) {
      const calls: string[] = []
      const mockCustomer = customer ?? {
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: null,
        },
      }

      return {
        calls,
        mockCustomer,
        retrieve: async (customerId: string) => {
          calls.push(customerId)
          return mockCustomer
        },
      }
    }

    function createMockCustomersUpdate(options?: { error?: Error }) {
      const calls: Array<{ customerId: string; params: any }> = []
      const mockError = options?.error ?? null

      return {
        calls,
        mockError,
        update: async (customerId: string, params: any) => {
          calls.push({ customerId, params })
          if (mockError) {
            throw mockError
          }
          return { id: customerId, ...params }
        },
      }
    }

    function createMockLogger() {
      const calls = {
        debug: [] as Array<{ context: any; message: string }>,
        info: [] as Array<{ context: any; message: string }>,
        warn: [] as Array<{ context: any; message: string }>,
        error: [] as Array<{ context: any; message: string }>,
      }

      return {
        calls,
        logger: {
          debug: (context: any, message: string) => {
            calls.debug.push({ context, message })
          },
          info: (context: any, message: string) => {
            calls.info.push({ context, message })
          },
          warn: (context: any, message: string) => {
            calls.warn.push({ context, message })
          },
          error: (context: any, message: string) => {
            calls.error.push({ context, message })
          },
        } as Logger,
      }
    }

    beforeEach(async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve()
      mockCustomersUpdate = createMockCustomersUpdate()
      const loggerMock = createMockLogger()
      mockLogger = loggerMock.logger
      loggerCalls = loggerMock.calls

      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))
    })

    afterEach(() => {
      clearMockedModules()
    })

    it('should return existing default payment method when valid', async () => {
      const defaultPaymentMethodId = 'pm_default_123'
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: defaultPaymentMethodId,
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [
        createCardPaymentMethod('pm_default_123', 2099, 12),
        createCardPaymentMethod('pm_other', 2099, 6),
      ]

      const result = await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(result.paymentMethodId).toBe(defaultPaymentMethodId)
      expect(result.wasUpdated).toBe(false)
      expect(mockCustomersUpdate.calls).toHaveLength(0)
    })

    it('should set first payment method as default when no default exists', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: null,
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [
        createCardPaymentMethod('pm_first', 2099, 12),
        createCardPaymentMethod('pm_second', 2099, 6),
      ]

      const result = await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(result.paymentMethodId).toBe('pm_first')
      expect(result.wasUpdated).toBe(true)
      expect(mockCustomersUpdate.calls).toHaveLength(1)
      expect(mockCustomersUpdate.calls[0].params.invoice_settings.default_payment_method).toBe('pm_first')
    })

    it('should set new default when existing default is not in valid payment methods list', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: 'pm_old_invalid',
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [
        createCardPaymentMethod('pm_new_valid', 2099, 12),
        createLinkPaymentMethod('pm_link'),
      ]

      const result = await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(result.paymentMethodId).toBe('pm_new_valid')
      expect(result.wasUpdated).toBe(true)
    })

    it('should handle default payment method as expanded object', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: { id: 'pm_expanded_123', type: 'card' },
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [
        createCardPaymentMethod('pm_expanded_123', 2099, 12),
        createCardPaymentMethod('pm_other', 2099, 6),
      ]

      const result = await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(result.paymentMethodId).toBe('pm_expanded_123')
      expect(result.wasUpdated).toBe(false)
    })

    it('should handle deleted customer by setting new default', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: true,
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [createCardPaymentMethod('pm_card', 2099, 12)]

      const result = await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(result.paymentMethodId).toBe('pm_card')
      expect(result.wasUpdated).toBe(true)
    })

    it('should log debug message when using existing default', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: 'pm_default',
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [createCardPaymentMethod('pm_default', 2099, 12)]

      await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(loggerCalls.debug).toHaveLength(1)
      expect(loggerCalls.debug[0].context.paymentMethodId).toBe('pm_default')
      expect(loggerCalls.debug[0].message).toBe('Using existing default payment method')
    })

    it('should log info message when setting new default', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: null,
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [createCardPaymentMethod('pm_new', 2099, 12)]

      await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(loggerCalls.info).toHaveLength(1)
      expect(loggerCalls.info[0].context.paymentMethodId).toBe('pm_new')
      expect(loggerCalls.info[0].message).toBe('Set first available payment method as default')
    })

    it('should proceed with payment method even if update fails', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: null,
        },
      })
      mockCustomersUpdate = createMockCustomersUpdate({
        error: new Error('Stripe API error'),
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [createCardPaymentMethod('pm_card', 2099, 12)]

      const result = await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext: { userId: 'user_123' },
      })

      expect(result.paymentMethodId).toBe('pm_card')
      expect(result.wasUpdated).toBe(false)
      expect(loggerCalls.warn).toHaveLength(1)
      expect(loggerCalls.warn[0].message).toBe(
        'Failed to set default payment method, but will proceed with payment',
      )
    })

    it('should call Stripe retrieve with correct customer ID', async () => {
      const paymentMethods = [createCardPaymentMethod('pm_card', 2099, 12)]

      await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_specific_123',
        paymentMethods,
        logger: mockLogger,
        logContext: {},
      })

      expect(mockCustomersRetrieve.calls).toContain('cus_specific_123')
    })

    it('should pass log context through to logger calls', async () => {
      mockCustomersRetrieve = createMockCustomersRetrieve({
        id: 'cus_123',
        deleted: false,
        invoice_settings: {
          default_payment_method: 'pm_default',
        },
      })
      await mockModule('@codebuff/internal/util/stripe', () => ({
        stripeServer: {
          customers: {
            retrieve: mockCustomersRetrieve.retrieve,
            update: mockCustomersUpdate.update,
          },
        },
      }))

      const paymentMethods = [createCardPaymentMethod('pm_default', 2099, 12)]
      const logContext = { userId: 'user_456', orgId: 'org_789' }

      await getOrSetDefaultPaymentMethod({
        stripeCustomerId: 'cus_123',
        paymentMethods,
        logger: mockLogger,
        logContext,
      })

      expect(loggerCalls.debug[0].context.userId).toBe('user_456')
      expect(loggerCalls.debug[0].context.orgId).toBe('org_789')
    })
  })

  describe('findValidPaymentMethod', () => {
    it('should return undefined for empty array', () => {
      const result = findValidPaymentMethod([])
      expect(result).toBeUndefined()
    })

    it('should return the payment method when single valid card exists', () => {
      const validCard = createCardPaymentMethod('pm_valid', 2099, 12)

      const result = findValidPaymentMethod([validCard])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_valid')
    })

    it('should return the payment method when single valid link exists', () => {
      const validLink = createLinkPaymentMethod('pm_link')

      const result = findValidPaymentMethod([validLink])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_link')
    })

    it('should return undefined when single payment method is invalid', () => {
      const expiredCard = createCardPaymentMethod('pm_expired', 2020, 1)

      const result = findValidPaymentMethod([expiredCard])

      expect(result).toBeUndefined()
    })

    it('should return undefined when all payment methods are invalid', () => {
      const expiredCard1 = createCardPaymentMethod('pm_expired_1', 2020, 1)
      const expiredCard2 = createCardPaymentMethod('pm_expired_2', 2015, 6)
      const sepa = createPaymentMethodWithType('pm_sepa', 'sepa_debit')

      const result = findValidPaymentMethod([expiredCard1, expiredCard2, sepa])

      expect(result).toBeUndefined()
    })

    it('should return the first valid payment method from a mixed list', () => {
      const expiredCard = createCardPaymentMethod('pm_expired', 2020, 1)
      const validCard = createCardPaymentMethod('pm_valid', 2099, 12)
      const validLink = createLinkPaymentMethod('pm_link')

      const result = findValidPaymentMethod([expiredCard, validCard, validLink])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_valid')
    })

    it('should return the first valid when multiple valid payment methods exist', () => {
      const validCard1 = createCardPaymentMethod('pm_card_1', 2099, 12)
      const validCard2 = createCardPaymentMethod('pm_card_2', 2050, 6)
      const validLink = createLinkPaymentMethod('pm_link')

      const result = findValidPaymentMethod([validCard1, validCard2, validLink])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_card_1')
    })

    it('should return link if it appears before valid cards', () => {
      const validLink = createLinkPaymentMethod('pm_link')
      const validCard = createCardPaymentMethod('pm_card', 2099, 12)

      const result = findValidPaymentMethod([validLink, validCard])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_link')
    })

    it('should skip invalid methods at the start and return first valid', () => {
      const expiredCard1 = createCardPaymentMethod('pm_expired_1', 2020, 1)
      const expiredCard2 = createCardPaymentMethod('pm_expired_2', 2019, 6)
      const sepa = createPaymentMethodWithType('pm_sepa', 'sepa_debit')
      const validCard = createCardPaymentMethod('pm_valid', 2099, 12)
      const validLink = createLinkPaymentMethod('pm_link')

      const result = findValidPaymentMethod([
        expiredCard1,
        expiredCard2,
        sepa,
        validCard,
        validLink,
      ])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_valid')
    })

    it('should return the only valid payment method even if last in list', () => {
      const expiredCard1 = createCardPaymentMethod('pm_expired_1', 2020, 1)
      const expiredCard2 = createCardPaymentMethod('pm_expired_2', 2019, 6)
      const sepa = createPaymentMethodWithType('pm_sepa', 'sepa_debit')
      const validLink = createLinkPaymentMethod('pm_link')

      const result = findValidPaymentMethod([
        expiredCard1,
        expiredCard2,
        sepa,
        validLink,
      ])

      expect(result).toBeDefined()
      expect(result?.id).toBe('pm_link')
    })

    it('should not mutate the original array', () => {
      const validCard = createCardPaymentMethod('pm_valid', 2099, 12)
      const expiredCard = createCardPaymentMethod('pm_expired', 2020, 1)
      const original = [expiredCard, validCard]
      const originalLength = original.length

      findValidPaymentMethod(original)

      expect(original).toHaveLength(originalLength)
      expect(original[0].id).toBe('pm_expired')
      expect(original[1].id).toBe('pm_valid')
    })
  })
})
