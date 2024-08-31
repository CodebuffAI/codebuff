import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'

const postSchema = z.object({
  commentId: z.number(),
  hide: z.boolean(),
})
export const hidecommentonlover = authEndpoint(async (req, auth) => {
  const { commentId, hide } = validate(postSchema, req.body)

  const pg = createSupabaseDirectClient()
  const comment = await pg.oneOrNone(
    `select * from lover_comments where id = $1`,
    [commentId]
  )
  if (!comment) {
    throw new APIError(404, 'Comment not found')
  }

  if (
    !isAdminId(auth.uid) &&
    comment.user_id !== auth.uid &&
    comment.on_user_id !== auth.uid
  ) {
    throw new APIError(403, 'You are not allowed to hide this comment')
  }

  await pg.none(`update lover_comments set hidden = $2 where id = $1`, [
    commentId,
    hide,
  ])

  return { status: 'success' }
})
