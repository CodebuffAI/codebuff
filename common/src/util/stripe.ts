import Stripe from 'stripe'

import { env } from '../env.mjs'

export const stripeServer = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
})

// stripeServer.on('request', (request) => {
//   console.log('Stripe API Request', request)
// })

// // Listen for response events
// stripeServer.on('response', (response) => {
//   console.log('Stripe API Response', response)
// })
