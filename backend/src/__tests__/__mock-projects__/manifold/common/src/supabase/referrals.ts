import { run, SupabaseClient } from 'common/supabase/utils'
import { User } from 'common/user'
import { pick } from 'lodash'

export async function getReferralCount(
  userId: string,
  since: number,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('users')
      .select('*', { head: true, count: 'exact' })
      .gte('created_time', new Date(since).toISOString())
      .eq('data->>referredByUserId', userId)
  )
  return count
}

export async function getTopReferrals(db: SupabaseClient) {
  const { data } = await run(
    db.from('user_referrals_profit').select('*').limit(20)
  )
  const users = data.map((r) => ({
    totalReferrals: r.total_referrals,
    rank: r.rank,
    totalReferredProfit: r.total_referred_profit,
    ...pick(r.data as User, ['name', 'username', 'avatarUrl', 'id'] as const),
  }))
  return users
}
export async function getUserReferralsInfo(userId: string, db: SupabaseClient) {
  const { data } = await run(
    db.from('user_referrals_profit').select('*').eq('id', userId)
  )
  let fallbackRank = 0
  if (data.length === 0) {
    const { count } = await db
      .from('user_referrals')
      .select('*', { head: true, count: 'exact' })
    fallbackRank = (count ?? Infinity) + 1
  }

  return { ...data[0], rank: data[0]?.rank ?? fallbackRank }
}
