import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export const recordContractInteraction: APIHandler<
  'record-contract-interaction'
> = async (body, auth) => {
  const {
    contractId,
    kind,
    feedType,
    commentId,
    betGroupId,
    betId,
    feedReasons,
  } = body
  log('recordContractInteraction', body)
  const pg = createSupabaseDirectClient()
  await pg.none(
    `
    insert into user_contract_interactions
        (
          user_id,
          contract_id,
          name,
          feed_type,
          feed_reasons,
          comment_id,
          bet_group_id,
          bet_id
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      auth.uid,
      contractId,
      kind,
      feedType,
      feedReasons,
      commentId,
      betGroupId,
      betId,
    ]
  )
  return { status: 'success' }
}
