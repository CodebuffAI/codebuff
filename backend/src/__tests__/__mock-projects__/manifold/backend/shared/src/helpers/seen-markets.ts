import { SupabaseDirectClient } from 'shared/supabase/init'

export const hasUserSeenMarket = async (
  marketId: string,
  userId: string,
  since: number,
  pg: SupabaseDirectClient
) => {
  return await pg.oneOrNone(
    `
    select exists (
      select 1 from user_contract_views
      where contract_id = $1
      and user_id = $2
      and greatest(last_page_view_ts, last_promoted_view_ts, last_card_view_ts) > millis_to_ts($3))
    `,
    [marketId, userId, since],
    (row) => row.exists as boolean
  )
}
