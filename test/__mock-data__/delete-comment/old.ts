import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { deleteCommentDirect } from 'shared/supabase/comments'

export const deleteComment: APIHandler<'delete-comment'> = async (
  props,
  auth
) => {
  const { commentId } = props
  const pg = createSupabaseDirectClient()

  try {
    await deleteCommentDirect(pg, commentId, auth.uid)
    return { success: true }
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    console.error('Error deleting comment:', error)
    throw new APIError(500, 'Failed to delete comment')
  }
}
