import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const recordCommentView: APIHandler<'record-comment-view'> = async (
  body,
  auth
) => {
  const { commentId, contractId } = body
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into user_comment_view_events(user_id, contract_id, comment_id)
             values ($1, $2, $3)`,
    [auth.uid, contractId, commentId]
  )
  return {
    status: 'success',
  }
}
