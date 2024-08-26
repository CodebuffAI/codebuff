import { SupabaseClient } from 'common/supabase/utils'

export const getAnswerBettorCount = async (
  db: SupabaseClient,
  contractId: string,
  answerId: string
) => {
  const { count } = await db
    .from('user_contract_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('contract_id', contractId)
    .eq('answer_id', answerId)
    .eq('has_shares', true)
  return count ?? 0
}
