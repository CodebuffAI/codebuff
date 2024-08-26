import { LiquidityProvision } from 'common/liquidity-provision'
import { insert } from './utils'
import { SupabaseDirectClient } from './init'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'

export const insertLiquidity = async (
  pg: SupabaseDirectClient,
  liquidity: Omit<LiquidityProvision, 'id'>
) => {
  // TODO: generate ids in supabase instead
  const doc = { id: randomString(), ...liquidity }

  return await insert(pg, 'contract_liquidity', {
    liquidity_id: doc.id,
    contract_id: doc.contractId,
    data: JSON.stringify(removeUndefinedProps(doc)) + '::jsonb',
  })
}
