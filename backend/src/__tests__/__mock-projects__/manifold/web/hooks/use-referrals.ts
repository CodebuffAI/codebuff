import { useEffect, useState } from 'react'
import { getReferrals } from 'web/lib/supabase/referrals'

type UserSearchResult = Awaited<ReturnType<typeof getReferrals>>[number]

export const useReferrals = (userId: string) => {
  const [referredUsers, setReferredUsers] = useState<
    UserSearchResult[] | undefined
  >()

  useEffect(() => {
    getReferrals(userId).then((referrals) => {
      setReferredUsers(referrals)
    })
  }, [userId])

  return referredUsers
}
