import type { DefaultSession } from 'next-auth'

// Mirror the per-app augmentation (web/src/types/next-auth.d.ts,
// freebuff/web/src/types/next-auth.d.ts) so the shared factory type-checks the
// custom session/user fields it sets.
declare module 'next-auth' {
  interface Session {
    user?: {
      id: string
      stripe_customer_id: string | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
    stripe_customer_id: string | null
  }
}
