import { PrivateUser } from 'common/user'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEffect } from 'react'
import { BoostsType, getBoosts } from 'web/lib/supabase/ads'
import { db } from 'web/lib/supabase/db'
import { sum } from 'lodash'
import { AD_REDEEM_REWARD } from 'common/boost'

const TOTAL_BOOSTS_PER_DAY = 40
export const useBoosts = (
  privateUser: PrivateUser | null | undefined,
  key: string
) => {
  const [boosts, setBoosts] = usePersistentInMemoryState<
    BoostsType | undefined
  >(undefined, `boosts-${privateUser?.id}-${key}`)

  useEffect(() => {
    if (privateUser) getLimitedBoosts(privateUser)
  }, [privateUser?.id])

  const getLimitedBoosts = async (privateUser: PrivateUser) => {
    const { data } = await db.rpc('get_daily_claimed_boosts', {
      user_id: privateUser.id,
    })
    const totalBoostFundsClaimed = sum(data?.map((d) => d.total))
    const boostsLeft =
      TOTAL_BOOSTS_PER_DAY - totalBoostFundsClaimed / AD_REDEEM_REWARD

    if (boostsLeft > 0) getBoosts(privateUser, boostsLeft).then(setBoosts)
    else setBoosts([])
  }

  return boosts
}
