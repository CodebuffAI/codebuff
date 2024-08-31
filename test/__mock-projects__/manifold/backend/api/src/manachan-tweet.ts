import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { postTweet } from 'shared/twitter'
import { MANACHAN_TWEET_COST } from 'common/economy'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { runTxn } from 'shared/txn/run-txn'
import { insert } from 'shared/supabase/utils'

const bodySchema = z
  .object({
    tweet: z.string().trim().min(1).max(280),
  })
  .strict()

export const manachantweet = authEndpoint(async (req, auth) => {
  const { tweet } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  const result = await pg.tx(async (tx) => {
    await runTxn(tx, {
      category: 'MANACHAN_TWEET',
      token: 'M$',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: MANACHAN_TWEET_COST,
    })

    const result = await postTweet(tweet)

    await insert(tx, 'manachan_tweets', {
      user_id: auth.uid,
      username: user.name,
      tweet_id: result.id,
      tweet: result.text,
      created_time: Date.now(),
      cost: MANACHAN_TWEET_COST,
    })

    return result
  })

  return { success: true, tweetId: result.id }
})
