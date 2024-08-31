import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { APIHandler } from './helpers/endpoint'

export const blockMarket: APIHandler<'market/:contractId/block'> = async (
  { contractId },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await updatePrivateUser(pg, auth.uid, {
    blockedContractIds: FieldVal.arrayConcat(contractId),
  })
}

export const unblockMarket: APIHandler<'market/:contractId/unblock'> = async (
  { contractId },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await updatePrivateUser(pg, auth.uid, {
    blockedContractIds: FieldVal.arrayRemove(contractId),
  })
}
