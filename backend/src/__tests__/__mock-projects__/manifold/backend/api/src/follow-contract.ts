import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const followContract: APIHandler<'follow-contract'> = async (
  { contractId, follow },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await followContractInternal(pg, contractId, follow, auth.uid)
  return { success: true }
}
export const followContractInternal = async (
  pg: SupabaseDirectClient,
  contractId: string,
  follow: boolean,
  followerId: string
) => {
  if (follow) {
    await pg.none(
      `insert into contract_follows (contract_id, follow_id)
       values ($1, $2)
       on conflict (contract_id, follow_id) do nothing`,
      [contractId, followerId]
    )
  } else {
    await pg.none(
      `delete from contract_follows
       where contract_id = $1 and follow_id = $2`,
      [contractId, followerId]
    )
  }
}
