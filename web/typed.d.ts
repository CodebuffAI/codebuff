import { DefaultUser } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user?: DefaultUser & {
      id: string
      stripe_customer_id: string
      subscription_active: boolean
    }
  }
  interface User extends DefaultUser {
    stripe_customer_id: string
    subscription_active: boolean
  }
}
