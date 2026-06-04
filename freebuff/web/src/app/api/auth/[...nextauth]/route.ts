import NextAuth from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { getFreebuffNextAuthUrl } from '../../../../lib/freebuff-server-env'

// NextAuth v4 reads this OS env var internally when building OAuth callback
// URLs. Keep that integration point fed from the typed Freebuff env wrapper.
process.env.NEXTAUTH_URL = getFreebuffNextAuthUrl()
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
