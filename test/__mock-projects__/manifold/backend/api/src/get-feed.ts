import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { PrivateUser } from 'common/user'
import { orderBy, uniqBy } from 'lodash'
import {
  from,
  renderSql,
  select,
  join,
  limit as lim,
  where,
  orderBy as order,
  leftJoin,
  groupBy,
} from 'shared/supabase/sql-builder'
import { buildArray, filterDefined } from 'common/util/array'
import { log } from 'shared/utils'
import { adContract } from 'common/boost'
import {
  activeTopics,
  buildUserInterestsCache,
  minimumContractsQualityBarWhereClauses,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { privateUserBlocksSql } from 'shared/supabase/search-contracts'
import { getFollowedReposts, getTopicReposts } from 'shared/supabase/reposts'
import { FeedContract, GROUP_SCORE_PRIOR } from 'common/feed'

const DEBUG_USER_ID = undefined
const DEBUG_FEED = process.platform === 'darwin'
export const getFeed: APIHandler<'get-feed'> = async (props) => {
  const { limit, offset, ignoreContractIds } = props
  const pg = createSupabaseDirectClient()
  // Use random user ids so that postgres doesn't cache the query:
  const userId =
    DEBUG_FEED && DEBUG_USER_ID
      ? DEBUG_USER_ID
      : DEBUG_FEED
      ? (await pg.oneOrNone(
          `select user_id from user_contract_interactions
            where created_time > now() - interval '1 days'
            order by random() limit 1`,
          [],
          (r) => r?.user_id as string | undefined
        )) ?? props.userId
      : props.userId

  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }
  const privateUser = await pg.one(
    `select data from private_users where id = $1`,
    [userId],
    (r) => r.data as PrivateUser
  )
  // If they don't follow any topics and have no recorded topic activity, show them top trending markets
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    log('no topic interests for user', userId)
    const defaultContracts = await pg.map(
      `select data, importance_score, conversion_score, freshness_score, view_count, token from contracts
                order by importance_score desc
                limit $1 offset $2`,
      [limit * 4, offset],
      (r) => convertContract(r)
    )
    return {
      contracts: defaultContracts,
      ads: [],
      idsToReason: Object.fromEntries(
        defaultContracts.map((c) => [c.id, 'importance'])
      ),
      comments: [],
      bets: [],
      reposts: [],
    }
  }
  const viewedContractsQuery = renderSql(
    select(`contract_id, max(view_time) AS latest_seen_time`),
    from(
      `(select contract_id, last_page_view_ts as view_time from user_contract_views where user_id = $1 union all
           select contract_id, last_promoted_view_ts as view_time from user_contract_views where user_id = $1 union all
           select contract_id, last_card_view_ts as view_time from user_contract_views where user_id = $1) as combined_views`,
      [userId]
    ),
    groupBy(`contract_id`)
  )

  const claimedAdsQuery = renderSql(
    select('1'),
    from(`txns`),
    where(`category = 'MARKET_BOOST_REDEEM'`),
    where(`to_id = $1`, [userId]),
    where(`from_id = market_ads.id`)
  )

  const adsJoin = renderSql(
    select(`market_ads.id, market_id, funds, cost_per_view`),
    from(`market_ads`),
    join(`contracts on market_ads.market_id = contracts.id`),
    where(`funds >= cost_per_view`),
    where(`market_ads.user_id != $1`, [userId]),
    where(`contracts.close_time > now()`),
    where(`contracts.visibility = 'public'`),
    where(`not exists (${claimedAdsQuery})`),
    order(`cost_per_view desc`),
    lim(50)
  )
  const userInterestTopicIds = Object.keys(
    userIdsToAverageTopicConversionScores[userId]
  )
  const userInterestTopicWeights = Object.values(
    userIdsToAverageTopicConversionScores[userId]
  )
  const newUser = userInterestTopicIds.length < 100
  if (!newUser) {
    // add top trending topics from activeTopics that aren't in user's interests already
    const topUnseenActiveTopics = orderBy(
      Object.entries(activeTopics).filter(
        ([topicId]) => !userInterestTopicIds.includes(topicId)
      ),
      ([, score]) => score,
      'desc'
    ).slice(0, 10)
    userInterestTopicIds.push(
      ...topUnseenActiveTopics.map(([topicId]) => topicId)
    )
    userInterestTopicWeights.push(
      ...topUnseenActiveTopics.map(([, score]) => score)
    )
  }
  const MAX_TOPICS_TO_EVALUATE = 350
  const cutoffIndex =
    userInterestTopicWeights.length > MAX_TOPICS_TO_EVALUATE
      ? Math.min(
          userInterestTopicWeights.filter((w) => w > GROUP_SCORE_PRIOR).length,
          MAX_TOPICS_TO_EVALUATE
        )
      : userInterestTopicWeights.length

  const baseQueryArray = (adQuery = false) =>
    buildArray(
      select('contracts.*'),
      !adQuery
        ? select(
            `avg(uti.topic_score) as topic_conversion_score, cv.latest_seen_time`
          )
        : select(`uti.topic_score as topic_conversion_score, ma.id as ad_id`),
      from(
        `(select
               unnest(array[$1]) as group_id,
               unnest(array[$2]) as topic_score
                ) as uti`,
        [
          userInterestTopicIds.slice(0, cutoffIndex),
          userInterestTopicWeights.slice(0, cutoffIndex),
        ]
      ),
      join(`group_contracts on group_contracts.group_id = uti.group_id`),
      join(`contracts on contracts.id = group_contracts.contract_id`),
      // Another option: get the top 1000 contracts by uti.CS * contracts.CS and then filter by user_contract_views
      !adQuery && [
        leftJoin(
          `(${viewedContractsQuery}) cv ON cv.contract_id = contracts.id`
        ),
        where(`cv.latest_seen_time is null`),
      ],
      ...minimumContractsQualityBarWhereClauses(adQuery),
      where(
        `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
        [userId]
      ),
      (ignoreContractIds?.length ?? 0) > 0 &&
        where(`contracts.id <> all(array[$1])`, [ignoreContractIds]),
      privateUserBlocksSql(privateUser),
      lim(limit, offset),
      !adQuery && groupBy(`contracts.id, cv.latest_seen_time`)
    )

  const adsQuery = renderSql(
    ...baseQueryArray(true),
    join(`(${adsJoin}) ma on ma.market_id = contracts.id`),
    order(
      `uti.topic_score  * contracts.conversion_score * ma.cost_per_view desc`
    )
  )

  const followedQuery = renderSql(
    ...baseQueryArray(),
    where(
      `contracts.creator_id in (select follow_id from user_follows where user_id = $1)`,
      [userId]
    ),
    order(`contracts.conversion_score desc`)
  )
  const sorts = {
    conversion: `avg(uti.topic_score  * contracts.conversion_score) desc`,
    freshness: `avg(uti.topic_score  * contracts.freshness_score) desc`,
  }
  const sortQueries = Object.values(sorts).map((orderQ) =>
    renderSql(...baseQueryArray(), order(orderQ))
  )

  if (DEBUG_FEED) {
    const explain = await pg.many(`explain analyze ${sortQueries[0]}`, [])
    log('explain:', explain.map((q) => q['QUERY PLAN']).join('\n'))
  }
  const startTime = Date.now()
  const [
    convertingContracts,
    freshContracts,
    followedContracts,
    adContracts,
    followedRepostData,
    topicRepostData,
  ] = await Promise.all([
    ...sortQueries.map((sortQuery) =>
      pg.map(
        sortQuery,
        [],
        (r) =>
          ({
            contract: convertContract(r),
            topicConversionScore: r.topic_conversion_score as number,
          } as FeedContract)
      )
    ),
    pg.map(
      followedQuery,
      [],
      (r) =>
        ({
          contract: convertContract(r),
          topicConversionScore: r.topic_conversion_score as number,
        } as FeedContract)
    ),
    pg.map(
      adsQuery,
      [],
      (r) =>
        ({
          adId: r.ad_id as string,
          contract: convertContract(r),
          topicConversionScore: r.topic_conversion_score as number,
        } as FeedContract)
    ),
    getFollowedReposts(
      userId,
      limit,
      offset,
      userIdsToAverageTopicConversionScores[userId],
      renderSql(privateUserBlocksSql(privateUser)).replace('where', 'and'),
      pg
    ),
    getTopicReposts(
      userId,
      limit,
      offset,
      userInterestTopicIds,
      userInterestTopicWeights,
      renderSql(privateUserBlocksSql(privateUser)).replace('where', 'and'),
      pg
    ),
  ])
  log('feed queries completed in (s):', (Date.now() - startTime) / 1000, {
    userId,
    ignoreContractIds: ignoreContractIds?.length,
  })
  const allReposts = followedRepostData.concat(topicRepostData)

  const contracts = uniqBy(
    orderBy(
      convertingContracts.concat(freshContracts, followedContracts, allReposts),
      (c) =>
        c.contract.conversionScore *
        c.contract.freshnessScore *
        c.topicConversionScore,
      'desc'
    ).map((c) => c.contract),
    (c) => c.id
  )
  const idsToReason: { [id: string]: string } = Object.fromEntries(
    contracts.map((c) => [
      c.id,
      followedContracts.find((cc) => cc.contract.id === c.id)
        ? 'followed'
        : convertingContracts.find((cc) => cc.contract.id === c.id)
        ? 'conversion'
        : freshContracts.find((cc) => cc.contract.id === c.id)
        ? 'freshness'
        : '',
    ])
  )
  const ads = (adContracts as adContract[]).filter(
    (c) => !contracts.map((c) => c.id).includes(c.contract.id)
  )
  return {
    contracts,
    ads,
    idsToReason,
    comments: filterDefined(allReposts.map((c) => c.comment)),
    bets: filterDefined(allReposts.map((c) => c.bet)),
    reposts: filterDefined(allReposts.map((c) => c.repost)),
  }
}
