import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { groupBy, mapValues, sum, uniq } from 'lodash'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { bulkInsert } from 'shared/supabase/utils'
import { filterDefined } from 'common/util/array'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import {
  FEED_BETA_LOSS,
  GROUP_SCORE_PRIOR,
  FEED_CARD_HITS,
  FEED_CARD_MISSES,
} from 'common/feed'
import { TopicToInterestWeights } from 'shared/topic-interests'
import { tsToMillis } from 'common/supabase/utils'

const IGNORE_GROUP_IDS = [
  'Lokp5JWIA0BDlEPePSfS', // testing group
]
const BETS_ONLY_FOR_SCORE = [
  UNSUBSIDIZED_GROUP_ID,
  UNRANKED_GROUP_ID,
  ...IGNORE_GROUP_IDS,
]
export async function calculateUserTopicInterests(
  startTime?: number,
  readOnly?: boolean,
  testUserId?: string,
  createdTimesOnly?: string[]
) {
  const startDate = new Date(startTime ?? Date.now() - DAY_MS)
  const end = new Date(startDate.valueOf() + DAY_MS).toISOString()
  const start = startDate.toISOString()
  log(`Calculating user topic interests for ${start}`)
  const pg = createSupabaseDirectClient()
  const userCardGroupIdMisses = await pg.map(
    `
        select ucv.user_id, gc.group_id 
        from user_contract_views ucv
        join contracts c on ucv.contract_id = c.id
        join group_contracts gc on c.id = gc.contract_id
        left join user_contract_interactions uci on ucv.user_id = uci.user_id and ucv.contract_id = uci.contract_id
        where card_views > 0
          and ucv.last_card_view_ts > $1
          and ucv.last_card_view_ts < $2
          and c.visibility = 'public'
          and ($3 is null or ucv.user_id = $3)
          and gc.group_id not in ($4:list)
          and uci.name is null
    `,
    [start, end, testUserId, IGNORE_GROUP_IDS],
    (row) => [row.user_id as string, row.group_id as string]
  )

  const userGroupIdHits: string[][] = []
  const userPageViewedGroupIds = await pg.map(
    `
        select distinct on (uve.user_id, uve.contract_id, gc.group_id) uve.user_id, gc.group_id from user_view_events uve
         join contracts c on uve.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
        where uve.created_time > $1
          and uve.created_time < $2
          and c.visibility = 'public'
          and name = 'page'
          and ($3 is null or user_id = $3)
          and gc.group_id not in ($4:list)
    `,
    [start, end, testUserId, BETS_ONLY_FOR_SCORE],
    (row) => [row.user_id as string, row.group_id as string]
  )
  userGroupIdHits.push(...userPageViewedGroupIds)

  const userGroupIdInteractions = await pg.map(
    `
      select distinct on (uci.user_id, uci.contract_id, gc.group_id) uci.user_id, gc.group_id from user_contract_interactions uci
         join contracts c on uci.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
           where uci.created_time > $1
           and uci.created_time < $2
           and c.visibility = 'public'
           and uci.name not in ('promoted click')
           and ($3 is null or user_id = $3)
           and gc.group_id not in ($4:list)
           and (uci.name in ('card bet','page bet', 'card like', 'page like', 'page repost')
                or
                gc.group_id not in ($5:list))
      `,
    [start, end, testUserId, IGNORE_GROUP_IDS, BETS_ONLY_FOR_SCORE],
    (row) => [row.user_id as string, row.group_id as string]
  )
  userGroupIdHits.push(...userGroupIdInteractions)

  const groupIdMissesByUserId = groupBy(userCardGroupIdMisses, (row) => row[0])
  const userIdsToGroupIdMisses = mapValues(groupIdMissesByUserId, (rows) =>
    rows.map((row) => row[1])
  )
  const groupIdHitsByUserId = groupBy(userGroupIdHits, (row) => row[0])
  const userIdsToGroupIdsHits = mapValues(groupIdHitsByUserId, (rows) =>
    rows.map((row) => row[1])
  )

  const allUserIds = uniq([
    ...Object.keys(userIdsToGroupIdMisses),
    ...Object.keys(userIdsToGroupIdsHits),
  ])
  await getPreviousStats(pg, allUserIds, createdTimesOnly)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const betaIncompleteInverse = require('@stdlib/math-base-special-betaincinv')
  log(`Writing user topic interests for ${allUserIds.length} users`)
  const scoresToWrite = filterDefined(
    allUserIds.map((userId) => {
      const myPriorConversionScores = userIdToGroupStats[userId] ?? {}
      const myPriorGroupIds = Object.keys(myPriorConversionScores)
      const myGroupIdHits = userIdsToGroupIdsHits?.[userId] ?? []
      const myGroupIdMisses = userIdsToGroupIdMisses?.[userId] ?? []
      const allGroupIds = uniq([
        ...myGroupIdHits,
        ...myGroupIdMisses,
        ...myPriorGroupIds,
      ])
      const groupIdsToConversionScore = Object.fromEntries(
        allGroupIds.map((groupId) => {
          const priorStats =
            myPriorConversionScores[groupId] ??
            ({
              conversionScore: GROUP_SCORE_PRIOR,
              hits: 0,
              misses: 0,
            } as GroupIdsToStats[number])
          let score = priorStats.conversionScore
          const hits = myGroupIdHits.filter((g) => g === groupId).length
          const misses = myGroupIdMisses.filter((g) => g === groupId).length
          if (hits !== 0 || misses !== 0) {
            const totalHits = priorStats.hits + hits + FEED_CARD_HITS
            const totalMisses = priorStats.misses + misses + FEED_CARD_MISSES
            // Using score from https://www.evanmiller.org/bayesian-average-ratings.html
            score = betaIncompleteInverse(
              1 / (1 + FEED_BETA_LOSS),
              totalHits,
              totalMisses
            )
          }
          return [
            groupId,
            {
              conversionScore: score,
              hits,
              misses,
            },
          ]
        })
      ) as GroupIdsToStats

      if (
        Object.keys(groupIdsToConversionScore).length === 0 ||
        Object.values(groupIdsToConversionScore).some(
          (v) =>
            v.conversionScore === null ||
            v.conversionScore === undefined ||
            isNaN(v.conversionScore) ||
            v.conversionScore < 0
        )
      ) {
        log.error('Skipping conversion score writes for user: ' + userId)
        return undefined
      }

      return {
        user_id: userId,
        group_ids_to_activity: groupIdsToConversionScore,
        created_time: start,
      }
    })
  )
  if (!readOnly) await bulkInsert(pg, 'user_topic_interests', scoresToWrite)
}

type GroupIdsToStats = {
  [groupId: string]: {
    conversionScore: number
    hits: number
    misses: number
  }
}
type UserIdToGroupStats = {
  [userId: string]: GroupIdsToStats
}
type GroupIdsToConversionScore = {
  [groupId: string]: { conversionScore: number }
}
const userIdToGroupStats: UserIdToGroupStats = {}
const getPreviousStats = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  createdTimesOnly?: string[]
) => {
  if (createdTimesOnly && createdTimesOnly.length === 0) return
  const previousStats = await pg.map(
    `
    select user_id, group_ids_to_activity, created_time from user_topic_interests
    where user_id in ($1:list)
    and ($2 is null or created_time in ($2:list))
    order by created_time
  `,
    [userIds, createdTimesOnly ?? null],
    (row) => ({
      userId: row.user_id as string,
      activity: row.group_ids_to_activity as
        | GroupIdsToStats
        | TopicToInterestWeights,
      // In case we want to use this for decay:
      createdTime: tsToMillis(row.created_time as string) as number,
    })
  )
  for (const row of previousStats) {
    if (!userIdToGroupStats[row.userId]) userIdToGroupStats[row.userId] = {}
    const groupIdToStats = row.activity as
      | GroupIdsToStats
      | GroupIdsToConversionScore
    const groupIds = Object.keys(groupIdToStats)
    for (const groupId of groupIds) {
      const previousStats = userIdToGroupStats[row.userId][groupId] ?? {}
      const stats = groupIdToStats[groupId]
      if ('hits' in stats) {
        userIdToGroupStats[row.userId][groupId] = {
          hits: sum([previousStats.hits, stats.hits]),
          misses: sum([previousStats.misses, stats.misses]),
          conversionScore: stats.conversionScore,
        }
      } else {
        userIdToGroupStats[row.userId][groupId] = {
          hits: FEED_CARD_HITS,
          misses: FEED_CARD_MISSES,
          conversionScore: GROUP_SCORE_PRIOR,
        }
      }
    }
  }
}
