import { chunk } from 'lodash'

import { getPrivateUsersNotSent, isProd, log } from 'shared/utils'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { PrivateUser } from 'common/user'
import { getForYouSQL } from 'shared/supabase/search-contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'

// Run every minute on Monday for 3 hours starting at 12pm PT.
// Should scale until at least 1000 * 120 = 120k users signed up for emails (70k at writing)
const EMAILS_PER_BATCH = 1000
export async function sendWeeklyMarketsEmails() {
  if (!isProd()) return
  const pg = createSupabaseDirectClient()
  const privateUsers = await getPrivateUsersNotSent(
    'trending_markets',
    EMAILS_PER_BATCH,
    pg
  )
  await pg.none(
    `update private_users set weekly_trending_email_sent = true where id = any($1)`,
    [privateUsers.map((u) => u.id)]
  )

  const CHUNK_SIZE = 50
  let i = 0
  const chunks = chunk(privateUsers, CHUNK_SIZE)
  await buildUserInterestsCache(privateUsers.map((u) => u.id))
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (privateUser) => {
        const contractsToSend = await getForYouMarkets(
          privateUser.id,
          6,
          privateUser
        )
        // TODO: bulkify this
        await sendInterestingMarketsEmail(
          privateUser.name,
          privateUser,
          contractsToSend
        )
        if (userIdsToAverageTopicConversionScores[privateUser.id]) {
          delete userIdsToAverageTopicConversionScores[privateUser.id]
        }
      })
    )

    i++
    log(
      `Sent ${i * CHUNK_SIZE} of ${
        privateUsers.length
      } weekly trending emails in this batch`
    )
  }
}

export async function getForYouMarkets(
  userId: string,
  limit: number,
  privateUser: PrivateUser
) {
  const searchMarketSQL = await getForYouSQL({
    userId,
    filter: 'open',
    contractType: 'ALL',
    limit,
    offset: 0,
    sort: 'score',
    isPrizeMarket: false,
    marketTier: '00000',
    privateUser,
    isSweepies: false,
    threshold: 200,
  })
  const pg = createSupabaseDirectClient()
  const contracts = await pg.map(searchMarketSQL, [], (r) => convertContract(r))

  return contracts ?? []
}
