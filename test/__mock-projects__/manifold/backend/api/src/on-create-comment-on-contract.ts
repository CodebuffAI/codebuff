import { compact } from 'lodash'
import { log, revalidateStaticProps } from 'shared/utils'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import {
  createCommentOnContractNotification,
  replied_users_info,
} from 'shared/create-notification'
import { parseMentions, richTextToString } from 'common/util/parse'
import { Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { insertModReport } from 'shared/create-mod-report'
import { updateContract } from 'shared/supabase/contracts'
import { followContractInternal } from 'api/follow-contract'

export const onCreateCommentOnContract = async (props: {
  contract: Contract
  comment: ContractComment
  creator: User
  bet?: Bet
}) => {
  const { contract, comment, creator, bet } = props
  const pg = createSupabaseDirectClient()

  await revalidateStaticProps(contractPath(contract)).catch((e) =>
    log.error('Failed to revalidate contract after comment', {
      e,
      comment,
      creator,
    })
  )

  const lastCommentTime = comment.createdTime

  await followContractInternal(pg, contract.id, true, creator.id)

  await updateContract(pg, contract.id, {
    lastCommentTime,
    lastUpdatedTime: Date.now(),
  })

  await handleCommentNotifications(pg, comment, contract, creator, bet)
}

const getReplyInfo = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contract: Contract
) => {
  if (
    comment.answerOutcome &&
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.answers
  ) {
    const answer = contract.answers.find((a) => a.id === comment.answerOutcome)
    const comments = await pg.manyOrNone(
      `select comment_id, user_id
      from contract_comments
      where contract_id = $1 and coalesce(data->>'answerOutcome', '') = $2`,
      [contract.id, answer?.id ?? '']
    )
    return {
      repliedToAnswer: answer,
      repliedToType: 'answer',
      repliedUserId: answer?.userId,
      commentsInSameReplyChain: comments,
    } as const
  } else if (comment.replyToCommentId) {
    const comments = await pg.manyOrNone(
      `select comment_id, user_id, data->>'replyToCommentId' as reply_to_id
      from contract_comments where contract_id = $1
        and (coalesce(data->>'replyToCommentId', '') = $2
            or comment_id = $2)
      `,
      [contract.id, comment.replyToCommentId]
    )
    return {
      repliedToAnswer: null,
      repliedToType: 'comment',
      repliedUserId: comments.find(
        (c) => c.comment_id === comment.replyToCommentId
      )?.user_id,
      commentsInSameReplyChain: comments.filter(
        (c) => c.reply_to_id === comment.replyToCommentId
      ),
    } as const
  } else {
    return null
  }
}

export const handleCommentNotifications = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contract: Contract,
  commentCreator: User,
  bet: Bet | undefined
) => {
  const replyInfo = await getReplyInfo(pg, comment, contract)

  const modsId = 'WQJ92QkoqDPuyj6DAZ5lR6g1x573'
  const mentionedUsers = compact(parseMentions(comment.content))
  const mentionedMods = mentionedUsers.includes(modsId)

  const repliedUsers: replied_users_info = {}
  if (replyInfo) {
    const {
      repliedToType,
      repliedUserId,
      repliedToAnswer,
      commentsInSameReplyChain,
    } = replyInfo

    // The parent of the reply chain could be a comment or an answer
    if (repliedUserId && repliedToType)
      repliedUsers[repliedUserId] = {
        repliedToType,
        repliedToAnswerText: repliedToAnswer?.text,
        repliedToAnswerId: repliedToAnswer?.id,
        bet: bet,
      }

    if (commentsInSameReplyChain) {
      // The rest of the children in the chain are always comments
      commentsInSameReplyChain.forEach((c) => {
        if (c.user_id !== comment.userId && c.user_id !== repliedUserId) {
          repliedUsers[c.user_id] = {
            repliedToType: 'comment',
            repliedToAnswerText: undefined,
            repliedToAnswerId: undefined,
            bet: undefined,
          }
        }
      })
    }
  }
  if (mentionedMods) {
    await insertModReport(comment)
  }

  await createCommentOnContractNotification(
    comment.id,
    commentCreator,
    richTextToString(comment.content),
    contract,
    {
      repliedUsersInfo: repliedUsers,
      taggedUserIds: mentionedUsers,
    }
  )
  return [...mentionedUsers, ...Object.keys(repliedUsers)]
}
