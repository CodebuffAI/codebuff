import { groupBy, orderBy, sortBy } from 'lodash'
import { ContractComment } from 'common/comment'
export const IGNORE_COMMENT_FEED_CONTENT = ['gridCardsComponent']
export const groupCommentsByContractsAndParents = (
  comments: ContractComment[]
) => {
  // Grid cards make for huge, unwieldy comment threads
  const filteredUnseenCommentThreads = comments.filter(
    (ct) =>
      !ct.content?.content?.some((c) =>
        IGNORE_COMMENT_FEED_CONTENT.includes(c.type ?? '')
      )
  )
  const parentCommentsByContractId = groupBy(
    orderBy(
      filteredUnseenCommentThreads.filter((c) => !c.replyToCommentId),
      [(c) => c.likes ?? 0, (c) => c.createdTime],
      ['desc', 'desc']
    ),
    (c) => c.contractId
  )

  const childCommentsByParentCommentId = groupBy(
    sortBy(
      filteredUnseenCommentThreads.filter((c) => c.replyToCommentId),
      (c) => c.createdTime
    ),
    (c) => c.replyToCommentId
  )
  return {
    parentCommentsByContractId,
    childCommentsByParentCommentId,
  }
}
