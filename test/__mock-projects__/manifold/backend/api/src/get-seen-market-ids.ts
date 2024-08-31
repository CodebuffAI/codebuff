import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const VIEW_COLUMNS = {
  page: ['last_page_view_ts'],
  promoted: ['last_promoted_view_ts'],
  card: ['last_card_view_ts'],
} as const

export const getSeenMarketIds: APIHandler<'get-seen-market-ids'> = async (
  body,
  auth
) => {
  const { contractIds, since } = body
  const types = body.types ?? (['page', 'promoted', 'card'] as const)
  const pg = createSupabaseDirectClient()
  const columns = types.map((t) => VIEW_COLUMNS[t]).join(', ')
  return await pg.map(
    `select contract_id from user_contract_views
     where user_id = $1
     and contract_id in ($2:list)
     and greatest($3:raw) > millis_to_ts($4)`,
    [auth.uid, contractIds, columns, since],
    (r) => r.contract_id
  )
}
