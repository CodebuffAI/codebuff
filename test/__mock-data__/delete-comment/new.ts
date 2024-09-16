import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { deleteCommentDirect } from 'shared/supabase/comments'

export const deleteComment: APIHandler<'delete-comment'> = async (props, auth) => {
  const { commentId } = props
  const pg = createSupabaseDirectClient()

  await deleteCommentDirect(pg, commentId, auth.uid)
  return { success: true }
}
