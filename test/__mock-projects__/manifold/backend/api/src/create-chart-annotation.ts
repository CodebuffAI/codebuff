import { z } from 'zod'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import {
  log,
  getContractSupabase,
  getUser,
  revalidateContractStaticProps,
} from 'shared/utils'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { MAX_ID_LENGTH } from 'common/group'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getComment } from 'shared/supabase/contract-comments'
import { richTextToString } from 'common/util/parse'
import { broadcastNewChartAnnotation } from 'shared/websockets/helpers'

const bodySchema = z
  .object({
    contractId: z.string().max(MAX_ID_LENGTH),
    eventTime: z.number(),

    text: z.string().min(1).max(MAX_ANSWER_LENGTH).optional(),
    commentId: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    externalUrl: z.string().optional(),
    answerId: z.string().max(MAX_ANSWER_LENGTH).optional(),
    probChange: z.number().max(1).min(-1).optional(),
  })
  .strict()

export const createchartannotation = authEndpoint(async (req, auth) => {
  const {
    contractId,
    text: passedText,
    commentId,
    externalUrl,
    thumbnailUrl: passedThumbnailUrl,
    eventTime,
    answerId,
    probChange,
  } = validate(bodySchema, req.body)

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(404, 'Your account was not found')
  const pg = createSupabaseDirectClient()

  const comment = commentId ? await getComment(pg, commentId) : null

  const text = passedText
    ? passedText.trim()
    : comment
    ? richTextToString(comment.content)
    : null

  const thumbnailUrl =
    !passedThumbnailUrl && text ? creator.avatarUrl : passedThumbnailUrl
  log('Received chart annotation', {
    contractId,
    text,
    commentId,
    externalUrl,
    thumbnailUrl,
    eventTime,
    answerId,
    probChange,
  })

  const res = await pg.one(
    `
    insert into chart_annotations
        (contract_id, event_time, text, comment_id, external_url, thumbnail_url,
         creator_id, creator_name, creator_username, creator_avatar_url, answer_id,
         user_username, user_avatar_url, user_name, user_id, prob_change
         )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    returning *
        `,
    [
      contractId,
      eventTime,
      text,
      commentId,
      externalUrl,
      thumbnailUrl,
      creator.id,
      creator.name,
      creator.username,
      creator.avatarUrl,
      answerId,
      comment?.userUsername ?? null,
      comment?.userAvatarUrl ?? null,
      comment?.userName ?? null,
      comment?.userId ?? null,
      probChange ?? null,
    ]
  )

  broadcastNewChartAnnotation(contractId, res)
  await revalidateContractStaticProps(contract)

  return { success: true, id: Number(res.id) }
})
