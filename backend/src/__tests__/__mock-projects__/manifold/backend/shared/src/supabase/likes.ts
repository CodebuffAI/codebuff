import { SupabaseClient } from 'common/supabase/utils'

export async function getRecentContractLikes(
  db: SupabaseClient,
  since: number
) {
  const response = await db.rpc('recently_liked_contract_counts', {
    since,
  })
  const likesByContract = Object.fromEntries(
    (response.data ?? []).flat().map(({ contract_id, n }) => [contract_id, n])
  )
  return likesByContract
}
