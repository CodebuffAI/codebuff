import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { toFullMarket, toLiteMarket } from 'common/api/market-types'
import { convertContract } from 'common/supabase/contracts'

export const getMarket = async (
  props: ({ id: string } | { slug: string }) & { lite?: boolean }
) => {
  const pg = createSupabaseDirectClient()
  const contract = await pg.oneOrNone(
    `select * from contracts
            where ${'id' in props ? 'id' : 'slug'} = $1`,
    ['id' in props ? props.id : props.slug],
    (r) => (r ? convertContract(r) : null)
  )
  if (!contract) throw new APIError(404, 'Contract not found')

  return props.lite ? toLiteMarket(contract) : toFullMarket(contract)
}
