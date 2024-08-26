import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUniqueBetGroupCount: APIHandler<
  'unique-bet-group-count'
> = async (props) => {
  const { contractId } = props

  const pg = createSupabaseDirectClient()

  return await pg.one(
    `select count(distinct(data->>'betGroupId')) as count
               from contract_bets where contract_id = $1 
                                                    `,
    [contractId]
  )
}
