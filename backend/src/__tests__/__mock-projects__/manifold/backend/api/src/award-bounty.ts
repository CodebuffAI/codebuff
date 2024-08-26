import { type APIHandler } from './helpers/endpoint'
import { createBountyAwardedNotification } from 'shared/create-notification'
import { getContract } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getComment } from 'shared/supabase/contract-comments'
import { awardBounty as doAwardBounty } from 'shared/bounty'

export const awardBounty: APIHandler<
  'market/:contractId/award-bounty'
> = async (props, auth) => {
  const { contractId, commentId, amount } = props
  const pg = createSupabaseDirectClient()
  const comment = await getComment(pg, commentId)

  const txn = await doAwardBounty({
    contractId,
    fromUserId: auth.uid,
    toUserId: comment.userId,
    commentId,
    prevBountyAwarded: comment.bountyAwarded,
    amount,
  })

  const contract = await getContract(pg, contractId)
  if (contract) {
    await createBountyAwardedNotification(
      comment.userId,
      contract,
      contractId,
      amount
    )
  }

  return txn
}
