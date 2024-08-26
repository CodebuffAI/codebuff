import { run } from 'common/supabase/utils'
import { db } from './db'
import { PrivateUser } from 'common/user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { Contract } from 'common/contract'

// supabase type generator adds an extra array in the return type of getBoosts, so we define our own type instead
export type BoostsType =
  | {
      ad_id: string
      market_id: string
      ad_funds: number
      ad_cost_per_view: number
      market_data: Contract
    }[]
  | null
export const getBoosts = async (privateUser: PrivateUser, limit: number) => {
  const { data } = await db.rpc('get_market_ads', {
    uid: privateUser.id,
  })
  return (
    (data
      ?.flat()
      .filter(
        (d) => !isContractBlocked(privateUser, d.market_data as Contract)
      ) as BoostsType) ?? []
  ).slice(0, limit)
}

export async function getAdCanPayFunds(adId: string) {
  const query = db
    .from('market_ads')
    .select('funds,cost_per_view')
    .eq('id', adId)
    .limit(1)

  const { data } = await run(query)
  if (data && data.length > 0) {
    const canPay = data[0].funds >= data[0].cost_per_view
    return canPay
  } else {
    return false
  }
}
