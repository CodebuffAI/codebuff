import { SupabaseClient } from '@supabase/supabase-js'

export const getBountyRewardCount = async (
  db: SupabaseClient,
  contractId: string
) => {
  const { count } = await db
    .from('txns')
    .select('*', { count: 'exact', head: true })
    .eq('from_id', contractId)
    .in('category', ['BOUNTY_CANCELED', 'BOUNTY_AWARDED'])

  return count ?? 0
}
