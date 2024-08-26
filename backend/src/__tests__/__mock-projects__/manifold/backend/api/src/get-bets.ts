import { APIError, type APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { getUserIdFromUsername } from 'shared/supabase/users'
import { getBetsWithFilter } from 'shared/supabase/bets'
import { NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'

export const getBets: APIHandler<'bets'> = async (props) => {
  const {
    limit,
    username,
    contractSlug,
    answerId,
    before,
    after,
    beforeTime,
    afterTime,
    order,
    kinds,
    filterRedemptions,
    includeZeroShareRedemptions,
    count,
    points,
  } = props
  if (limit === 0) {
    return []
  } else if (limit > NON_POINTS_BETS_LIMIT && !points) {
    throw new APIError(
      400,
      'Non-points limit must be less than or equal to ' + NON_POINTS_BETS_LIMIT
    )
  }
  const pg = createSupabaseDirectClient()

  const userId = props.userId ?? (await getUserIdFromUsername(pg, username))
  const contractId =
    props.contractId ?? (await getContractIdFromSlug(pg, contractSlug))

  // mqp: this pagination approach is technically incorrect if multiple bets
  // have the exact same createdTime, but that's very unlikely
  const beforeBetTime =
    before === undefined
      ? undefined
      : await getBetTime(pg, before).catch(() => {
          throw new APIError(404, 'Bet specified in before parameter not found')
        })

  const afterBetTime = !after
    ? undefined
    : await getBetTime(pg, after).catch(() => {
        throw new APIError(404, 'Bet specified in after parameter not found')
      })

  const opts = {
    userId,
    contractId,
    answerId,
    beforeTime:
      beforeTime !== undefined && beforeBetTime !== undefined
        ? Math.min(beforeTime, beforeBetTime)
        : beforeTime ?? beforeBetTime,
    afterTime:
      afterTime && afterBetTime
        ? Math.max(afterTime, afterBetTime)
        : afterTime ?? afterBetTime,
    limit,
    order,
    kinds,
    filterRedemptions,
    includeZeroShareRedemptions,
    count,
    points,
  }

  return await getBetsWithFilter(pg, opts)
}

async function getBetTime(pg: SupabaseDirectClient, id: string) {
  const created = await pg.oneOrNone(
    `
  select ts_to_millis(created_time) as "createdTime" from postgres.public.contract_bets where bet_id = $1`,
    [id],
    (r) => r.createdTime
  )
  return created ?? undefined
}
