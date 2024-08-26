import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  groupBy,
  join,
  leftJoin,
  limit as sqlLimit,
  limit as lim,
  orderBy,
  renderSql,
  select,
  where,
  withClause,
} from 'shared/supabase/sql-builder'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { PROD_MANIFOLD_LOVE_GROUP_SLUG } from 'common/envs/constants'
import { constructPrefixTsQuery } from 'shared/helpers/search'
import { buildArray } from 'common/util/array'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { log } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { GROUP_SCORE_PRIOR } from 'common/feed'
import { MarketTierType, TierParamsType, tiers } from 'common/tier'

const DEFAULT_THRESHOLD = 1000
const DEBUG = false

let importanceScoreThreshold: number | undefined = undefined
let freshnessScoreThreshold: number | undefined = undefined

export async function getForYouSQL(items: {
  userId: string
  filter: string
  contractType: string
  limit: number
  offset: number
  sort: 'score' | 'freshness-score'
  isPrizeMarket: boolean
  isSweepies: boolean
  marketTier: TierParamsType
  privateUser?: PrivateUser
  threshold?: number
}) {
  const {
    filter,
    contractType,
    limit,
    offset,
    sort,
    isPrizeMarket,
    isSweepies,
    marketTier,
    privateUser,
    threshold = DEFAULT_THRESHOLD,
  } = items

  let userId = items.userId

  if (
    importanceScoreThreshold === undefined ||
    freshnessScoreThreshold === undefined
  )
    await loadScoreThresholds(threshold)
  const sortByScore = sort === 'score' ? 'importance_score' : 'freshness_score'
  if (DEBUG && process.platform === 'darwin') {
    userId = await loadRandomUser()
    log('Searching for random user id:', userId)
  }

  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }
  // Still no topic interests, return default search
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    log('No topic interests found for user', userId)
    return renderSql(
      select(
        `data, importance_score, conversion_score, freshness_score, view_count, token`
      ),
      from('contracts'),
      orderBy(`${sortByScore} desc`),
      getSearchContractWhereSQL({
        filter,
        contractType,
        uid: userId,
        hideStonks: true,
        isPrizeMarket,
        isSweepies,
        marketTier,
      }),
      privateUserBlocksSql(privateUser),
      lim(limit, offset)
    )
  }

  const forYou = renderSql(
    buildArray(
      select(
        'contracts.*, coalesce(avg(uti.avg_conversion_score),1) as avg_topic_conversion_score'
      ),
      from('contracts'),
      join(`group_contracts on contracts.id = group_contracts.contract_id`),
      leftJoin(
        `(select
          unnest(array[$1]) as group_id,
          unnest(array[$2]) as avg_conversion_score)
          as uti on uti.group_id = group_contracts.group_id`,
        [
          Object.keys(userIdsToAverageTopicConversionScores[userId]),
          Object.values(userIdsToAverageTopicConversionScores[userId]),
        ]
      ),
      where(
        `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
        [userId]
      ),
      privateUserBlocksSql(privateUser),
      withClause(
        `user_follows as (select follow_id from user_follows where user_id = $1)`,
        [userId]
      ),
      getSearchContractWhereSQL({
        filter,
        contractType,
        uid: userId,
        hideStonks: true,
        isPrizeMarket,
        isSweepies,
        marketTier,
      }),
      offset <= threshold / 2 &&
        sort === 'score' &&
        importanceScoreThreshold &&
        where(`contracts.importance_score > $1`, [importanceScoreThreshold]),
      offset <= threshold / 2 &&
        sort === 'freshness-score' &&
        freshnessScoreThreshold &&
        where(`contracts.freshness_score > $1`, [freshnessScoreThreshold]),
      lim(limit, offset),
      groupBy('contracts.id'),
      // If user has contract-topic scores, use ONLY the defined topic scores when ranking
      // If the user has no contract-matching topic score, use only the contract's importance score
      orderBy(`case
      when bool_or(uti.avg_conversion_score is not null)
      then avg(coalesce(uti.avg_conversion_score, ${GROUP_SCORE_PRIOR}) * contracts.${sortByScore})
      else avg(contracts.${sortByScore}*${GROUP_SCORE_PRIOR})
      end * (1 + case
      when bool_or(contracts.creator_id = any(select follow_id from user_follows)) then 0.2
      else 0.0
      end)
      desc`)
    )
  )
  return forYou
}

export type SearchTypes =
  | 'without-stopwords'
  | 'with-stopwords'
  | 'description'
  | 'prefix'
  | 'answer'

export function getSearchContractSQL(args: {
  term: string
  filter: string
  sort: string
  contractType: string
  offset: number
  limit: number
  groupId?: string
  creatorId?: string
  uid?: string
  isForYou?: boolean
  searchType: SearchTypes
  isPrizeMarket?: boolean
  isSweepies?: boolean
  marketTier: TierParamsType
}) {
  const {
    term,
    sort,
    offset,
    limit,
    groupId,
    creatorId,
    searchType,
    marketTier,
  } = args
  const hideStonks = sort === 'score' && !term.length && !groupId
  const hideLove = sort === 'newest' && !term.length && !groupId && !creatorId

  const whereSql = getSearchContractWhereSQL({ ...args, hideStonks, hideLove })
  const isUrl = term.startsWith('https://manifold.markets/')
  if (isUrl) {
    const slug = term.split('/').pop()
    return renderSql(
      select('data, importance_score, view_count'),
      from('contracts'),
      whereSql,
      where('slug = $1', [slug])
    )
  }

  const answersSubQuery = renderSql(
    select('distinct a.contract_id'),
    from('answers a'),
    where(`a.text_fts @@ websearch_to_tsquery('english', $1)`, [term])
  )

  // Normal full text search
  return renderSql(
    select('data, importance_score, view_count'),
    from('contracts'),
    groupId && [
      join('group_contracts gc on gc.contract_id = contracts.id'),
      where('gc.group_id = $1', [groupId]),
    ],
    searchType === 'answer' &&
      join(
        `(${answersSubQuery}) as matched_answers on matched_answers.contract_id = contracts.id`
      ),

    whereSql,
    term.length && [
      searchType === 'prefix' &&
        where(
          `question_fts @@ to_tsquery('english', $1)`,
          constructPrefixTsQuery(term)
        ),
      searchType === 'without-stopwords' &&
        where(`question_fts @@ websearch_to_tsquery('english', $1)`, term),
      searchType === 'with-stopwords' &&
        where(
          `question_nostop_fts @@ websearch_to_tsquery('english_nostop_with_prefix', $1)`,
          term
        ),
      searchType === 'description' &&
        where(`description_fts @@ websearch_to_tsquery('english', $1)`, term),
    ],

    orderBy(getSearchContractSortSQL(sort)),
    sqlLimit(limit, offset)
  )
}

function getSearchContractWhereSQL(args: {
  filter: string
  sort?: string
  contractType: string
  creatorId?: string
  uid?: string
  hideStonks?: boolean
  hideLove?: boolean
  isPrizeMarket?: boolean
  isSweepies?: boolean
  marketTier: TierParamsType
}) {
  const {
    filter,
    sort,
    contractType,
    creatorId,
    uid,
    hideStonks,
    hideLove,
    isPrizeMarket,
    isSweepies,
    marketTier,
  } = args
  type FilterSQL = Record<string, string>
  const filterSQL: FilterSQL = {
    open: 'resolution_time IS NULL AND (close_time > NOW() or close_time is null)',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    // Include an extra day to capture markets that close on the first of the month. Add 7 hours to shift UTC time zone to PT.
    'closing-this-month': `close_time > now() AND close_time < (date_trunc('month', now()) + interval '1 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-next-month': `close_time > ((date_trunc('month', now()) + interval '1 month') + interval '1 day' + interval '7 hours') AND close_time < (date_trunc('month', now()) + interval '2 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    resolved: 'resolution_time IS NOT NULL',
    all: '',
  }
  const contractTypeFilter =
    contractType === 'ALL'
      ? ''
      : contractType === 'MULTIPLE_CHOICE'
      ? `outcome_type = 'FREE_RESPONSE' OR outcome_type = 'MULTIPLE_CHOICE'`
      : contractType === 'PSEUDO_NUMERIC'
      ? `outcome_type = 'PSEUDO_NUMERIC' OR outcome_type = 'NUMBER'`
      : `outcome_type = '${contractType}'`

  const stonkFilter =
    hideStonks && contractType !== 'STONK' ? `outcome_type != 'STONK'` : ''
  const loveFilter = hideLove
    ? `group_slugs is null or not group_slugs && $1`
    : ''
  const sortFilter = sort == 'close-date' ? 'close_time > NOW()' : ''
  const creatorFilter = creatorId ? `creator_id = '${creatorId}'` : ''
  const visibilitySQL = getContractPrivacyWhereSQLFilter(uid, creatorId)

  const deletedFilter = `deleted = false`

  const isPrizeMarketFilter = isPrizeMarket ? 'is_spice_payout = true' : ''

  const isSweepiesFilter = isSweepies ? `token = 'CASH'` : ''

  const tierFilters = tiers
    .map((tier: MarketTierType, index) =>
      marketTier[index] === '1' ? `tier = '${tier}'` : ''
    )
    .filter(Boolean)

  const combinedTierFilter =
    tierFilters.length > 1
      ? `(${tierFilters.join(' OR ')})`
      : tierFilters[0] ?? ''

  return [
    where(filterSQL[filter]),
    where(stonkFilter),
    where(loveFilter, [[PROD_MANIFOLD_LOVE_GROUP_SLUG]]),
    where(sortFilter),
    where(contractTypeFilter),
    where(visibilitySQL),
    where(creatorFilter),
    where(deletedFilter),
    where(isPrizeMarketFilter),
    where(isSweepiesFilter),
    where(combinedTierFilter),
  ]
}

type SortFields = Record<
  string,
  {
    sql: string
    sortCallback: (c: Contract) => number
    order: 'ASC' | 'DESC' | 'DESC NULLS LAST'
  }
>
export const sortFields: SortFields = {
  score: {
    sql: `importance_score::numeric desc, unique_bettor_count`,
    sortCallback: (c: Contract) =>
      c.importanceScore > 0 ? c.importanceScore : c.uniqueBettorCount,
    order: 'DESC',
  },
  'daily-score': {
    sql: 'daily_score',
    sortCallback: (c: Contract) => c.dailyScore,
    order: 'DESC',
  },
  'freshness-score': {
    sql: 'freshness_score',
    sortCallback: (c: Contract) => c.freshnessScore,
    order: 'DESC',
  },
  '24-hour-vol': {
    sql: "(data->>'volume24Hours')::numeric",
    sortCallback: (c: Contract) => c.volume24Hours,
    order: 'DESC',
  },
  liquidity: {
    sql: "(data->>'elasticity')::numeric",
    sortCallback: (c: Contract) => c.elasticity,
    order: 'ASC',
  },
  subsidy: {
    sql: "COALESCE((data->>'totalLiquidity')::numeric, 0)",
    sortCallback: (c: Contract) =>
      c.mechanism === 'cpmm-1' || c.mechanism === 'cpmm-multi-1'
        ? c.totalLiquidity
        : 0,
    order: 'DESC',
  },

  'last-updated': {
    sql: 'last_updated_time',
    sortCallback: (c: Contract) => c.lastUpdatedTime,
    order: 'DESC',
  },
  'most-popular': {
    sql: 'unique_bettor_count',
    sortCallback: (c: Contract) => c.uniqueBettorCount,
    order: 'DESC',
  },
  newest: {
    sql: 'created_time',
    sortCallback: (c: Contract) => c.createdTime,
    order: 'DESC',
  },
  'resolve-date': {
    sql: 'resolution_time',
    sortCallback: (c: Contract) => c.resolutionTime ?? 0,
    order: 'DESC NULLS LAST',
  },
  'close-date': {
    sql: 'close_time',
    sortCallback: (c: Contract) => c.closeTime ?? Infinity,
    order: 'ASC',
  },
  random: {
    sql: 'random()',
    sortCallback: () => Math.random(),
    order: 'DESC',
  },
  'bounty-amount': {
    sql: "COALESCE((data->>'bountyLeft')::numeric, -1)",
    sortCallback: (c: Contract) => ('bountyLeft' in c && c.bountyLeft) || -1,
    order: 'DESC',
  },
  'prob-descending': {
    sql: "resolution DESC, (data->>'p')::numeric",
    sortCallback: (c: Contract) => ('p' in c && c.p) || 0,
    order: 'DESC NULLS LAST',
  },
  'prob-ascending': {
    sql: "resolution DESC, (data->>'p')::numeric",
    sortCallback: (c: Contract) => ('p' in c && c.p) || 0,
    order: 'ASC',
  },
}
function getSearchContractSortSQL(sort: string) {
  return `${sortFields[sort].sql} ${sortFields[sort].order}`
}

const loadScoreThresholds = async (threshold: number) => {
  const pg = createSupabaseDirectClient()
  importanceScoreThreshold = await pg.one(
    `
        with ranked_contracts as (select importance_score,
                                         row_number() over (order by importance_score desc) as rn
                                  from contracts)
        select importance_score
        from ranked_contracts
        where rn = $1;`,
    [threshold],
    (r) => r.importance_score as number
  )
  freshnessScoreThreshold = await pg.one(
    `
        with ranked_contracts as (select freshness_score,
                                         row_number() over (order by freshness_score desc) as rn
                                  from contracts)
        select freshness_score
        from ranked_contracts
        where rn = $1;`,
    [threshold],
    (r) => r.freshness_score as number
  )
  log('Loaded importance score threshold:', importanceScoreThreshold)
  log('Loaded freshness score threshold:', freshnessScoreThreshold)
}

const loadRandomUser = async () => {
  const pg = createSupabaseDirectClient()
  return await pg.one(
    `SELECT user_id AS id FROM user_contract_interactions
    WHERE created_time > now() - interval '1 week' and created_time < now() - interval '5 days'
    ORDER BY random() LIMIT 1`,
    [],
    (r) => r.id as string
  )
}

export const privateUserBlocksSql = (privateUser?: PrivateUser) => {
  const {
    blockedByUserIds,
    blockedContractIds,
    blockedUserIds,
    blockedGroupSlugs,
  } = privateUser ?? {
    blockedByUserIds: [] as string[],
    blockedContractIds: [] as string[],
    blockedUserIds: [] as string[],
    blockedGroupSlugs: [] as string[],
  }
  const blockedIds = blockedUserIds.concat(blockedByUserIds)
  const blockedGroupsQuery = renderSql(
    select('1'),
    from(`group_contracts gc`),
    join(`groups g on gc.group_id = g.id`),
    where(`gc.contract_id = contracts.id`),
    where(`g.slug = any(array[$1])`, [blockedGroupSlugs])
  )
  return buildArray(
    blockedIds.length > 0 &&
      where(`contracts.creator_id <> all(array[$1])`, [blockedIds]),
    blockedContractIds.length > 0 &&
      where(`contracts.id <> all(array[$1])`, [blockedContractIds]),
    blockedGroupSlugs.length > 0 && where(`not exists (${blockedGroupsQuery})`)
  )
}
