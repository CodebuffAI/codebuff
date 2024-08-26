import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useUser } from './use-user'
import { getIsNative } from 'web/lib/native/is-native'

export const useRedirectIfSignedOut = () => {
  const user = useUser()
  const router = useRouter()
  useEffect(() => {
    if (user !== null) return
    // Go to landing page if not logged in.
    if (getIsNative()) router.replace('/sign-in-waiting')
    else router.replace('/')
  }, [user])
}
