import { db } from './db'
import { convertLiquidity } from 'common/supabase/liquidity'
import { run } from 'common/supabase/utils'

export const getLiquidtyDocs = async (contractId: string) => {
  const { data } = await run(
    db.from('contract_liquidity').select('*').eq('contract_id', contractId)
  )

  return data?.map(convertLiquidity)
}
