import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getContractFollows(contractId: string) {
  const { data } = await run(
    db
      .from('contract_follows')
      .select('follow_id')
      .eq('contract_id', contractId)
  )
  if (data && data.length > 0) {
    return data.map((d) => d.follow_id as string)
  } else {
    return []
  }
}

export async function getUserIdFollows(userId: string) {
  const { data } = await run(
    db.from('user_follows').select().eq('user_id', userId)
  )
  return data
}

export async function getUserFollowers(userId: string) {
  const { data } = await run(
    db.from('user_follows').select().eq('follow_id', userId)
  )
  return data
}

export async function getUserIsFollowing(simp: string, idol: string) {
  const { count } = await db
    .from('user_follows')
    .select('*', { head: true, count: 'exact' })
    .eq('user_id', simp)
    .eq('follow_id', idol)

  return !!count
}
