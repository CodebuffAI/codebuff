import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { PollOption } from 'common/poll-option'
import { createVotedOnPollNotification } from 'shared/create-notification'
import {
  getContract,
  getUser,
  revalidateContractStaticProps,
} from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'
import { pollQueue } from 'shared/helpers/fn-queue'

const schema = z
  .object({
    contractId: z.string(),
    voteId: z.string(),
  })
  .strict()

export const castpollvote = authEndpoint(async (req, auth) => {
  const { contractId, voteId } = validate(schema, req.body)
  return await pollQueue.enqueueFn(
    () => castPollVoteMain(contractId, voteId, auth.uid),
    [contractId]
  )
})

const castPollVoteMain = async (
  contractId: string,
  voteId: string,
  userId: string
) => {
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  if (user?.isBannedFromPosting) {
    throw new APIError(403, 'You are banned and cannot vote')
  }
  const pg = createSupabaseDirectClient()
  const res = await pg.tx(async (t) => {
    const contract = await getContract(t, contractId)
    if (!contract) {
      throw new APIError(404, 'Contract not found')
    }

    if (contract.outcomeType !== 'POLL') {
      throw new APIError(403, 'This contract is not a poll')
    }
    const options: PollOption[] = contract.options
    // Find the option to update
    const optionToUpdate = options.find((o) => o.id === voteId)

    const hasVoted = await t.oneOrNone(
      `select 1 as exists from votes where contract_id = $1 and user_id = $2`,
      [contractId, userId],
      (r) => r?.exists
    )

    if (hasVoted) {
      throw new APIError(403, 'You have already voted on this poll')
    }

    // Write the updated options back to the document
    await updateContract(t, contractId, {
      options: options.map((o) => ({
        ...o,
        votes: o.id === voteId ? o.votes + 1 : o.votes,
      })),
      uniqueBettorCount: contract.uniqueBettorCount + 1,
    })

    // create the vote row
    const { id } = await t.one(
      `insert into votes(id, contract_id, user_id)
        values ($1, $2, $3)
        returning id`,
      [voteId, contractId, userId]
    )
    return { id, optionToUpdate, contract }
  })
  await createVotedOnPollNotification(
    user,
    res.optionToUpdate?.text ?? '',
    res.contract
  )

  return {
    result: { status: 'success', voteId: res.id },
    continue: async () => {
      await revalidateContractStaticProps(res.contract)
    },
  }
}
