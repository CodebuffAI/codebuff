import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { createLikeNotification } from 'shared/create-notification'
import { assertUnreachable } from 'common/util/types'
import { log } from 'shared/utils'

export const addOrRemoveReaction: APIHandler<'react'> = async (props, auth) => {
  const { contentId, contentType, remove } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  if (remove) {
    await pg.none(
      `delete from user_reactions
       where user_id = $1 and content_id = $2 and content_type = $3`,
      [userId, contentId, contentType]
    )
  } else {
    // get the id of the person this content belongs to, to denormalize the owner
    let ownerId: string
    if (contentType === 'comment') {
      const userId = await pg.oneOrNone(
        `select user_id from contract_comments where comment_id = $1`,
        [contentId],
        (r) => r?.user_id
      )

      if (!userId) {
        throw new APIError(404, 'Failed to find comment')
      }
      ownerId = userId
    } else if (contentType === 'contract') {
      const creatorId = await pg.oneOrNone(
        `select creator_id from contracts where id = $1`,
        [contentId],
        (r) => r?.creator_id
      )

      if (!creatorId) {
        throw new APIError(404, 'Failed to find contract')
      }

      ownerId = creatorId
    } else {
      assertUnreachable(contentType)
    }

    // see if reaction exists already
    const existingReactions = await pg.manyOrNone(
      `select * from user_reactions
       where content_id = $1 and content_type = $2 and user_id = $3`,
      [contentId, contentType, userId]
    )

    if (existingReactions.length > 0) {
      log('Reaction already exists, do nothing')
      return { result: { success: true }, continue: async () => {} }
    }

    // actually do the insert
    const reactionRow = await pg.one(
      `insert into user_reactions
       (content_id, content_type, content_owner_id, user_id)
       values ($1, $2, $3, $4)
       returning *`,
      [contentId, contentType, ownerId, userId]
    )

    await createLikeNotification(reactionRow)
  }

  return {
    result: { success: true },
    continue: async () => {
      if (contentType === 'comment') {
        const count = await pg.one(
          `select count(*) from user_reactions
           where content_id = $1 and content_type = $2`,
          [contentId, contentType],
          (r) => r.count
        )
        log('new like count ' + count)
        await pg.none(
          `update contract_comments set likes = $1 where comment_id = $2`,
          [count, contentId]
        )
      }
    },
  }
}
