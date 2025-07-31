import type { DefaultUser } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user?: DefaultUser & {
      id: string
      stripe_customer_id: string
      subscription_active: boolean
      stripe_price_id: string | null
    }
  }
  interface User extends DefaultUser {
    stripe_customer_id: string
    subscription_active: boolean
    stripe_price_id: string | null
  }
}
