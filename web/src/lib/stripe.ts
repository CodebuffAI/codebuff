import { loadStripe } from '@stripe/stripe-js'
import { env } from '@/env.mjs'
import { trackUpgradeClick } from './linkedin'
import Stripe from 'stripe'

export const handleCreateCheckoutSession = async (
  setIsPending: (isPending: boolean) => void
) => {
  setIsPending(true)

  const utm_source = trackUpgradeClick()

  const res = await fetch(`/api/stripe/checkout-session${utm_source}`)
  const checkoutSession: Stripe.Response<Stripe.Checkout.Session> = await res
    .json()
    .then(({ session }) => session as Stripe.Response<Stripe.Checkout.Session>)
  const stripe = await loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  if (!stripe) {
    throw new Error('Stripe not loaded')
  }

  const successUrl = new URL(`${env.NEXT_PUBLIC_APP_URL}/payment-success`)
  successUrl.searchParams.set('session_id', checkoutSession.id)
  if (utm_source) {
    successUrl.searchParams.append('utm_source', utm_source.slice(12)) // Remove "?utm_source="
  }

  await stripe.redirectToCheckout({
    sessionId: checkoutSession.id,
    successUrl: successUrl.toString(),
  })

  setIsPending(false)
}
