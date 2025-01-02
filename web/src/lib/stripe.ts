import { loadStripe } from '@stripe/stripe-js'
import { env } from '@/env.mjs'
import Stripe from 'stripe'
import { trackUpgrade } from './trackConversions'

export const handleCreateCheckoutSession = async (plan: string) => {
  const params = new URLSearchParams(trackUpgrade(false))
  params.append('plan', plan)
  const res = await fetch(`/api/stripe/checkout-session?${params}`)
  const checkoutSession: Stripe.Response<Stripe.Checkout.Session> = await res
    .json()
    .then(({ session }) => session as Stripe.Response<Stripe.Checkout.Session>)
  const stripe = await loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  if (!stripe) {
    throw new Error('Stripe not loaded')
  }

  await stripe.redirectToCheckout({
    sessionId: checkoutSession.id,
  })
}
