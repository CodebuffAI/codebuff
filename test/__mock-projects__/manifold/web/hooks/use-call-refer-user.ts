import { useEffect } from 'react'
import { setCachedReferralInfoForUser } from 'web/lib/firebase/users'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'

export const useCallReferUser = () => {
  const authed = useIsAuthorized()
  const user = useUser()
  useEffect(() => {
    if (!authed || !user) return
    setCachedReferralInfoForUser(user)
  }, [authed, user])
}
