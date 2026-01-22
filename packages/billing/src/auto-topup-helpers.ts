import { stripeServer } from '@codebuff/internal/util/stripe'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type Stripe from 'stripe'

/**
 * Fetches both card and link payment methods for a Stripe customer.
 *
 * Note: Only 'card' and 'link' types are supported as these are the primary
 * payment method types used for off-session automatic charges. Other types
 * (e.g., 'us_bank_account', 'sepa_debit') may have different confirmation
 * requirements that don't work well with auto-topup flows.
 */
export async function fetchPaymentMethods(
  stripeCustomerId: string,
): Promise<Stripe.PaymentMethod[]> {
  const [cardPaymentMethods, linkPaymentMethods] = await Promise.all([
    stripeServer.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
    }),
    stripeServer.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'link',
    }),
  ])

  return [...cardPaymentMethods.data, ...linkPaymentMethods.data]
}

/**
 * Checks if a payment method is valid for use.
 * Cards are checked for expiration, link methods are always valid.
 */
export function isValidPaymentMethod(pm: Stripe.PaymentMethod): boolean {
  if (pm.type === 'card') {
    // Cards are valid through the END of their expiration month.
    // Compare against the first day of the month AFTER expiration.
    // e.g., card expiring 01/2024 is valid until Feb 1, 2024
    return (
      pm.card?.exp_year !== undefined &&
      pm.card.exp_month !== undefined &&
      new Date() < new Date(pm.card.exp_year, pm.card.exp_month, 1)
    )
  }
  if (pm.type === 'link') {
    return true
  }
  return false
}

/**
 * Filters payment methods to only include valid (non-expired) ones.
 */
export function filterValidPaymentMethods(
  paymentMethods: Stripe.PaymentMethod[],
): Stripe.PaymentMethod[] {
  return paymentMethods.filter(isValidPaymentMethod)
}

/**
 * Finds the first valid (non-expired) payment method from a list.
 * Cards are checked for expiration, link methods are always valid.
 */
export function findValidPaymentMethod(
  paymentMethods: Stripe.PaymentMethod[],
): Stripe.PaymentMethod | undefined {
  return paymentMethods.find(isValidPaymentMethod)
}

export interface PaymentIntentParams {
  amountInCents: number
  stripeCustomerId: string
  paymentMethodId: string
  description: string
  idempotencyKey: string
  metadata: Record<string, string>
}

/**
 * Creates a Stripe payment intent with idempotency key for safe retries.
 */
export async function createPaymentIntent(
  params: PaymentIntentParams,
): Promise<Stripe.PaymentIntent> {
  const {
    amountInCents,
    stripeCustomerId,
    paymentMethodId,
    description,
    idempotencyKey,
    metadata,
  } = params

  return stripeServer.paymentIntents.create(
    {
      amount: amountInCents,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description,
      metadata,
    },
    {
      idempotencyKey,
    },
  )
}

export interface GetOrSetDefaultPaymentMethodResult {
  paymentMethodId: string
  wasUpdated: boolean
}

/**
 * Gets the default payment method for a customer, or selects and sets the first available one.
 * Returns the payment method ID to use and whether it was newly set as default.
 */
export async function getOrSetDefaultPaymentMethod(params: {
  stripeCustomerId: string
  paymentMethods: Stripe.PaymentMethod[]
  logger: Logger
  logContext: Record<string, unknown>
}): Promise<GetOrSetDefaultPaymentMethodResult> {
  const { stripeCustomerId, paymentMethods, logger, logContext } = params

  if (paymentMethods.length === 0) {
    throw new Error('No payment methods available for this customer')
  }

  const customer = await stripeServer.customers.retrieve(stripeCustomerId)

  if (
    customer &&
    !customer.deleted &&
    customer.invoice_settings?.default_payment_method
  ) {
    const defaultPaymentMethodId =
      typeof customer.invoice_settings.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings.default_payment_method.id

    const isDefaultValid = paymentMethods.some(
      (pm) => pm.id === defaultPaymentMethodId,
    )

    if (isDefaultValid) {
      logger.debug(
        { ...logContext, paymentMethodId: defaultPaymentMethodId },
        'Using existing default payment method',
      )
      return { paymentMethodId: defaultPaymentMethodId, wasUpdated: false }
    }
  }

  const firstPaymentMethod = paymentMethods[0]
  const paymentMethodToUse = firstPaymentMethod.id
  let wasUpdated = false

  try {
    await stripeServer.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodToUse,
      },
    })
    wasUpdated = true

    logger.info(
      { ...logContext, paymentMethodId: paymentMethodToUse },
      'Set first available payment method as default',
    )
  } catch (error) {
    logger.warn(
      { ...logContext, paymentMethodId: paymentMethodToUse, error },
      'Failed to set default payment method, but will proceed with payment',
    )
  }

  return { paymentMethodId: paymentMethodToUse, wasUpdated }
}
