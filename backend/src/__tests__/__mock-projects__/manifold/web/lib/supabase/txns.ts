import { uniq } from 'lodash'
import { db } from './db'
import { millisToTs, run, tsToMillis } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { getDisplayUsers } from './users'

export async function getDonationsByCharity() {
  const { data } = await db.rpc('get_donations_by_charity')
  return Object.fromEntries(
    (data ?? []).map((r) => [
      r.charity_id,
      {
        total: r.total,
        numSupporters: r.num_supporters,
      },
    ])
  )
}

export function getDonationsPageQuery(charityId: string) {
  return async (p: { limit: number; after?: { ts: number } }) => {
    let q = db
      .from('txns')
      .select(`from_id, created_time, amount, token`)
      .eq('category', 'CHARITY')
      .eq('to_id', charityId)
      .order('created_time', { ascending: false } as any)
      .limit(p.limit)

    if (p.after?.ts) {
      q = q.lt('created_time', millisToTs(p.after.ts))
    }
    const txnData = (await run(q)).data
    const userIds = uniq(txnData.map((t) => t.from_id!))
    const users = await getDisplayUsers(userIds)
    const usersById = Object.fromEntries(
      filterDefined(users).map((u) => [u.id, u])
    )
    const donations = txnData.map((t) => ({
      user: usersById[t.from_id!],
      ts: tsToMillis(t.created_time),
      amount: t.token == 'M$' ? t.amount / 100 : t.amount / 1000,
    }))
    return donations
  }
}

export async function getMostRecentDonation() {
  const { data } = await run(
    db
      .from('txns')
      .select('from_id, to_id')
      .eq('category', 'CHARITY')
      .order('created_time', { ascending: false })
      .limit(1)
  )
  return data[0]
}
