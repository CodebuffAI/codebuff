import { PollOption } from 'common/poll-option'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createPollClosedNotification } from 'shared/create-notification'
import { updateContract } from 'shared/supabase/contracts'

export async function pollPollResolutions() {
  const pg = createSupabaseDirectClient()
  const closedPolls = await pg.manyOrNone(
    `select data from contracts where outcome_type = 'POLL' and close_time < now() and resolution_time is null`
  )

  await Promise.all(
    closedPolls.map(async (poll) => {
      const maxVoteIds = getMaxVoteIds(poll.data.options)

      const update = {
        resolutionTime: Date.now(),
        resolutions: maxVoteIds,
        isResolved: true,
      }

      let winner: PollOption | undefined = undefined
      if (maxVoteIds.length === 1) {
        winner = poll.data.options.find(
          (option: PollOption) => option.id === maxVoteIds[0]
        )
      }
      await createPollClosedNotification(
        winner
          ? `'${winner.text}' won with ${winner.votes} votes`
          : `It's a tie!`,
        poll.data
      )
      return updateContract(pg, poll.data.id, update)
    })
  )
}

export function getMaxVoteIds(arr: PollOption[]): string[] {
  // Reduce the array to a structure that keeps track of maxVotes and maxVoteIds
  const result = arr.reduce<{ maxVotes: number; maxVoteIds: string[] }>(
    (acc, item) => {
      if (item.votes > acc.maxVotes) {
        return { maxVotes: item.votes, maxVoteIds: [item.id] }
      } else if (item.votes === acc.maxVotes) {
        acc.maxVoteIds.push(item.id)
      }
      return acc
    },
    { maxVotes: -Infinity, maxVoteIds: [] }
  )

  return result.maxVoteIds
}
