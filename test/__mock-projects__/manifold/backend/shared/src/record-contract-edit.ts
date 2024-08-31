import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const recordContractEdit = async (
  contract: Contract,
  editorId: string,
  updatedKeys: string[]
) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into contract_edits (contract_id, editor_id, data, updated_keys) 
            values ($1, $2, $3, $4)
            on conflict do nothing`,
    [contract.id, editorId, contract, updatedKeys]
  )
}
