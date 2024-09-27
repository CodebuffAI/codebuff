import { DefaultUser } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user?: DefaultUser & {
      id: string
      stripeCustomerId: string
      subscriptionActive: boolean
    }
  }
  interface User extends DefaultUser {
    stripeCustomerId: string
    subscriptionActive: boolean
  }
}
