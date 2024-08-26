import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from './supabase/init'
import type { ContractComment } from 'common/src/comment'
import { getContract } from './utils'
import { APIError } from 'common/api/utils'

export const insertModReport = async (comment: ContractComment) => {
  const { id: comment_id, contractId: contract_id, userId: user_id } = comment

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contract_id)
  const creator_username = contract?.creatorUsername

  if (!creator_username) {
    throw new APIError(
      404,
      `Creator username not found for contract: ${contract_id}`
    )
  }

  const db = createSupabaseClient()

  const reportData = {
    comment_id,
    contract_id,
    user_id,
    status: 'new' as const,
    mod_note: '',
  }

  const { error } = await db.from('mod_reports').insert(reportData)

  if (error) {
    throw new APIError(404, 'Error inserting mod report:')
  }
}
