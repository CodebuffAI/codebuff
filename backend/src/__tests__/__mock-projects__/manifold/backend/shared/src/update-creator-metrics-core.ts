import { DAY_MS, MINUTE_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { User } from 'common/user'

import { buildArray } from 'common/util/array'
import { bulkInsert, bulkUpdate } from 'shared/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { chunk } from 'lodash'
export const CREATOR_UPDATE_FREQUENCY = 13
export async function updateCreatorMetricsCore() {
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const monthAgo = now - DAY_MS * 30
  const pg = createSupabaseDirectClient()
  log('Loading active creators...')
  // TODO: Once we've computed scores for all old market creators, we could focus just on the ones with open markets
  const allActiveUserIds = await pg.map(
    `
      select contracts.creator_id, latest_cph.ts
      from (
        select distinct creator_id
        from contracts
        where outcome_type != 'POLL'
--         and close_time > now() - interval '1 month'
      ) contracts
        left join lateral (
        select ts
        from creator_portfolio_history
        where user_id = contracts.creator_id
        order by ts desc
        limit 1
      ) latest_cph on true
      order by latest_cph.ts nulls first`,
    [],
    (r) => r.creator_id as string
  )
  const updatesPerDay = (24 * 60) / CREATOR_UPDATE_FREQUENCY
  const activeUserIds = allActiveUserIds.slice(
    0,
    allActiveUserIds.length / updatesPerDay
  )
  log(`Loaded ${activeUserIds.length} active creators.`)

  log('Loading creator portfolio updates...')
  const creatorPortfolioUpdates = await pg.map(
    `
        select creator_id,
        sum(contracts.view_count) as views,
        sum((contracts.data->'volume')::numeric) as volume,
        sum((contracts.data->'uniqueBettorCount')::bigint) as unique_bettors,
        sum((contracts.data->'collectedFees'->'creatorFee')::numeric) as fees_earned
        from contracts
        where creator_id in ($1:list)
        and contracts.outcome_type != 'POLL'
        group by creator_id
    `,
    [activeUserIds],
    (r) => ({
      user_id: r.creator_id as string,
      views: r.views as number,
      volume: r.volume as number,
      unique_bettors: Number(r.unique_bettors),
      fees_earned: r.fees_earned as number,
    })
  )
  log(`Loaded ${creatorPortfolioUpdates.length} creator portfolio updates.`)
  // TODO: after a week of calculating creator traders we can just use creator_portfolio_history instead of user cached traders
  const creatorTraders = await getPeriodTradersByUserId(
    pg,
    activeUserIds,
    yesterday,
    weekAgo,
    monthAgo
  )
  const activeUsers = await pg.map(
    `select data from users where id in ($1:list)`,
    [activeUserIds],
    (r) => r.data as User
  )
  const userUpdates = activeUsers
    .filter((u) => Object.keys(creatorTraders).includes(u.id))
    .map((user) => ({
      ...user,
      creatorTraders: {
        ...creatorTraders[user.id],
        allTime:
          creatorPortfolioUpdates.find((c) => c.user_id === user.id)
            ?.unique_bettors ?? 0,
      },
    }))
  const chunkSize = 50
  const userUpdateChunks = chunk(userUpdates, chunkSize)
  log('Writing updates and inserts...')
  await Promise.all(
    buildArray(
      creatorPortfolioUpdates.length > 0 &&
        bulkInsert(pg, 'creator_portfolio_history', creatorPortfolioUpdates)
          .catch((e) => log.error('Error inserting user portfolio history', e))
          .then(() =>
            log('Finished creating Supabase portfolio history entries...')
          ),
      Promise.all(
        userUpdateChunks.map(async (chunk) =>
          bulkUpdate(
            pg,
            'users',
            ['id'],
            chunk.map((u) => ({
              id: u.id,
              data: `${JSON.stringify(removeUndefinedProps(u))}::jsonb`,
            })),
            5 * MINUTE_MS
          )
        )
      )
        .catch((e) => log.error('Error bulk writing user updates', e))
        .then(() => log('Committed Firestore writes.'))
    )
  )

  log('Done.')
}

const getPeriodTradersByUserId = async (
  pg: SupabaseDirectClient,
  activeUserIds: string[],
  yesterday: number,
  weekAgo: number,
  monthAgo: number
) => {
  log('Loading creator trader counts...')
  const [yesterdayTraders, weeklyTraders, monthlyTraders] = await Promise.all(
    [yesterday, weekAgo, monthAgo].map((t) =>
      getCreatorTraders(pg, activeUserIds, t)
    )
  )
  log(`Loaded creator trader counts.`)
  return Object.fromEntries(
    activeUserIds.map((userId) => {
      const creatorTraders = {
        daily: yesterdayTraders[userId] ?? 0,
        weekly: weeklyTraders[userId] ?? 0,
        monthly: monthlyTraders[userId] ?? 0,
      }
      return [userId, creatorTraders]
    })
  )
}

const getCreatorTraders = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number
) => {
  return Object.fromEntries(
    await pg.map(
      `with contract_traders as (
          select distinct contract_id, user_id from contract_bets where created_time >= $2
      )
       select c.creator_id, count(ct.*)::int as total
       from contracts as c
          join contract_traders as ct on c.id = ct.contract_id
       where c.creator_id in ($1:list)
       and c.outcome_type != 'POLL'
       group by c.creator_id`,
      [userIds, new Date(since).toISOString()],
      (r) => [r.creator_id as string, r.total as number]
    )
  )
}
