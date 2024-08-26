import type { APIHandler } from 'api/helpers/endpoint'
import { Dictionary } from 'lodash'
import { LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserLimitOrdersWithContracts: APIHandler<
  'get-user-limit-orders-with-contracts'
> = async (props) => {
  const { count, userId } = props
  const pg = createSupabaseDirectClient()
  const contracts = [] as Contract[]
  const betsByContract = {} as Dictionary<LimitBet[]>
  await pg.map(
    `
    select contract_id, bets.data as bets, contracts.data as contracts
    from (
    select contract_id,
      array_agg(
        data
        order by created_time desc
      ) as data
    from contract_bets
    where user_id = $1
      and contract_bets.is_filled = false
      and contract_bets.is_cancelled = false
    group by contract_id
  ) as bets
  join contracts on contracts.id = bets.contract_id
  limit $2
  `,
    [userId, count],
    (r) => {
      betsByContract[r.contract_id] = r.bets as LimitBet[]
      contracts.push(r.contract as Contract)
    }
  )

  return { betsByContract, contracts }
}
