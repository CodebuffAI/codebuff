import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getContractSupabase, getUser, log } from 'shared/utils'
import { getComment } from 'shared/supabase/contract-comments'
import { createCommentOnContractInternal } from 'api/create-comment'
import { ContractComment } from 'common/comment'
import { removeUndefinedProps } from 'common/util/object'
import { trackPublicEvent } from 'shared/analytics'
import { JSONContent } from '@tiptap/core'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const post: APIHandler<'post'> = async (props, auth) => {
  const { contractId, content, betId: passedBetId, commentId } = props

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

  const poster = await getUser(auth.uid)
  if (!poster) throw new APIError(404, 'Your account was not found')
  if (poster.isBannedFromPosting || poster.userDeleted)
    throw new APIError(403, 'Deleted/banned users not allowed to post')
  const pg = createSupabaseDirectClient()

  let comment: ContractComment
  let betId = passedBetId
  let commentContinuation = async () => {}
  if (!content && !commentId && !betId) {
    throw new APIError(400, 'Must specify content, commentId, or betId')
  } else if (content && commentId) {
    throw new APIError(400, 'Cannot specify both content and commentId')
  } else if (content) {
    checkForNaughtyEmbeds(content)
    const { result, continue: commentContinue } =
      await createCommentOnContractInternal(
        contractId,
        auth,
        removeUndefinedProps({
          content,
          isRepost: true,
          replyToBetId: passedBetId,
        })
      )
    comment = result
    commentContinuation = commentContinue
  } else {
    // TODO: should we mark the comment as `isRepost`?
    if (!commentId) throw new APIError(400, 'Must specify at least a commentId')
    const existingComment = await getComment(pg, commentId)
    if (existingComment.userId !== auth.uid) {
      const commenter = await getUser(existingComment.userId)
      if (commenter?.isBannedFromPosting || commenter?.userDeleted)
        throw new APIError(400, 'Cannot post deleted/banned user comments')
    }
    if (existingComment.hidden)
      throw new APIError(400, 'Cannot post hidden comments')
    if (existingComment.replyToCommentId) {
      const parentComment = await getComment(
        pg,
        existingComment.replyToCommentId
      )
      if (parentComment.hidden)
        throw new APIError(400, 'Cannot post replies to hidden comments')
    }
    comment = existingComment
  }
  if (comment.betId) betId = comment.betId
  checkForNaughtyEmbeds(comment.content)

  log('Received post', {
    contractId,
    commentId,
    betId,
    content,
  })

  await trackPublicEvent(auth.uid, 'repost', {
    contractId,
    commentId,
    betId,
    content: !!content,
    isContentOwner: comment.userId === auth.uid,
  })

  const result = await pg.one(
    `
    insert into posts
        (contract_id, contract_comment_id, bet_id, user_id, user_name, user_username, user_avatar_url)
        values ($1, $2, $3, $4, $5, $6, $7)
    returning id
        `,
    [
      contractId,
      comment.id,
      betId,
      poster.id,
      poster.name,
      poster.username,
      poster.avatarUrl,
    ]
  )

  log('Inserted row into posts table', {
    resultId: result.id,
    contractId,
    commentId,
    betId,
    reposterId: poster.id,
  })

  return {
    result: comment,
    continue: async () => {
      await commentContinuation()
    },
  }
}

const checkForNaughtyEmbeds = (content: JSONContent) => {
  if (
    (content.content?.filter((c) => c.type === 'iframe').length ?? 0) > 1 ||
    !!content.content?.find((c) => c.type === 'gridCardsComponent') ||
    !!content.content?.find(
      (c) => c.type === 'iframe' && c.attrs?.src.includes('manifold.markets')
    )
  ) {
    throw new APIError(
      400,
      'Reposting comments with embedded markets or multiple iframes is not allowed.'
    )
  }
}
