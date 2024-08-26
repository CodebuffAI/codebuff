import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contentSchema } from 'common/api/zod-types'
import { createMarketReviewedNotification } from 'shared/create-notification'
import { parseJsonContentToText } from 'common/util/parse'
import { getContract, getUser } from 'shared/utils'

const schema = z
  .object({
    marketId: z.string(),
    review: contentSchema.optional(),
    rating: z.number().gte(0).lte(5).int(),
  })
  .strict()

export const leavereview = authEndpoint(async (req, auth) => {
  const { marketId, review, rating } = validate(schema, req.body)
  const pg = createSupabaseDirectClient()

  const contract = await getContract(pg, marketId)

  if (!contract) {
    throw new APIError(404, `No market found with id ${marketId}`)
  }

  const { creatorId } = contract

  if (contract.creatorId === auth.uid) {
    throw new APIError(403, `You can't review your own market`)
  }

  const reviewer = await getUser(auth.uid, pg)
  if (!reviewer) {
    throw new APIError(404, `No user found with id ${auth.uid}`)
  }
  if (reviewer.isBannedFromPosting) {
    throw new APIError(403, `You are banned`)
  }

  await pg.query(
    `insert into reviews (market_id, reviewer_id, vendor_id, rating, content)
     values ($1, $2, $3, $4, $5)
     on conflict (market_id, reviewer_id) do update
     set rating = $4, content = $5`,
    [marketId, auth.uid, creatorId, rating, review]
  )

  await createMarketReviewedNotification(
    creatorId,
    reviewer,
    contract,
    rating,
    parseJsonContentToText(review ?? ''),
    pg
  )

  return { success: true }
})
