import { APIError } from 'common/api/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContractsDirect } from 'shared/supabase/contracts'
import { APIHandler } from './helpers/endpoint'

export const getContract: APIHandler<'get-contract'> = async (
  { contractId }
) => {
  const pg = createSupabaseDirectClient()
  const contracts = await getContractsDirect([contractId], pg)

  if (contracts.length === 0) {
    throw new APIError(404, `Contract ${contractId} not found`)
  }

  return contracts[0]
}