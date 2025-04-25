import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user?: {
      id: string
      stripe_customer_id: string | null
      stripe_price_id: string | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
    stripe_customer_id: string | null
    stripe_price_id: string | null
  }
}