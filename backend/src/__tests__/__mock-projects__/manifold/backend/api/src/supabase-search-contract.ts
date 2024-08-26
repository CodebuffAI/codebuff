import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'
import {
  getSearchContractSQL,
  getForYouSQL,
  SearchTypes,
  sortFields,
} from 'shared/supabase/search-contracts'
import { getGroupIdFromSlug } from 'shared/supabase/groups'
import { orderBy, uniqBy } from 'lodash'
import { convertContract } from 'common/supabase/contracts'
import { log } from 'shared/utils'
import { toLiteMarket } from 'common/api/market-types'
import { searchProps } from 'common/api/market-search-types'
import { TierParamsType } from 'common/tier'

export const searchMarketsLite: APIHandler<'search-markets'> = async (
  props,
  auth
) => {
  const contracts = await search(props, auth?.uid)
  return contracts.map(toLiteMarket)
}

export const searchMarketsFull: APIHandler<'search-markets-full'> = async (
  props,
  auth
) => {
  return await search(props, auth?.uid)
}

const search = async (
  props: z.infer<typeof searchProps>,
  userId: string | undefined
) => {
  const {
    term = '',
    filter,
    sort,
    contractType,
    offset,
    limit,
    topicSlug: possibleTopicSlug,
    forYou,
    creatorId,
    marketTier,
  } = props

  const isPrizeMarket =
    props.isPrizeMarket == 'true' || props.isPrizeMarket == '1'

  const isSweepies = props.isSweepies == 'true' || props.isSweepies == '1'

  if (limit === 0) {
    return []
  }

  const isForYou = forYou === '1'
  const isRecent = possibleTopicSlug === 'recent'
  const topicSlug =
    possibleTopicSlug && !isRecent ? possibleTopicSlug : undefined
  const pg = createSupabaseDirectClient()
  const groupId = topicSlug
    ? await getGroupIdFromSlug(topicSlug, pg)
    : undefined
  let contracts
  if (
    isForYou &&
    !term &&
    userId &&
    (sort === 'score' || sort === 'freshness-score') &&
    !topicSlug &&
    !isSweepies
  ) {
    const forYouSql = await getForYouSQL({
      userId,
      filter,
      contractType,
      limit,
      offset,
      sort,
      isPrizeMarket,
      isSweepies,
      marketTier: marketTier as TierParamsType,
    })
    const start = Date.now()
    contracts = await pg.map(forYouSql, [term], (r) => convertContract(r))
    log('For you search completed in (s):', (Date.now() - start) / 1000)
  } else if (isRecent && !term && userId) {
    contracts = await pg.map(
      'select data from get_your_recent_contracts($1, $2, $3)',
      [userId, limit, offset],
      convertContract
    )
  } else {
    const searchTypes: SearchTypes[] = [
      'prefix',
      'without-stopwords',
      'answer',
      'with-stopwords',
      'description',
    ]
    const [
      contractPrefixMatches,
      contractsWithoutStopwords,
      contractsWithMatchingAnswers,
      contractsWithStopwords,
      contractDescriptionMatches,
    ] = await Promise.all(
      searchTypes.map(async (searchType) => {
        const searchSQL = getSearchContractSQL({
          term,
          filter,
          sort,
          contractType,
          offset,
          limit,
          groupId,
          creatorId,
          uid: userId,
          isForYou,
          searchType,
          isPrizeMarket,
          isSweepies,
          marketTier: marketTier as TierParamsType,
        })
        return pg
          .map(searchSQL, null, (r) => ({
            data: convertContract(r),
            searchType,
          }))
          .catch((e) => {
            // to_tsquery is sensitive to special characters and can throw an error
            log.error(`Error with type: ${searchType} for term: ${term}`, e)
            return []
          })
      })
    )
    const contractsOfSimilarRelevance = orderBy(
      [
        ...contractsWithoutStopwords,
        ...contractsWithMatchingAnswers,
        ...contractPrefixMatches,
      ],
      (c) =>
        sortFields[sort].sortCallback(c.data) *
        (c.searchType === 'answer' ? 0.5 : 1),
      sortFields[sort].order.includes('DESC') ? 'desc' : 'asc'
    )

    contracts = uniqBy(
      [
        ...contractsWithStopwords,
        ...contractsOfSimilarRelevance,
        ...contractDescriptionMatches,
      ].map((c) => c.data),
      'id'
    ).slice(0, limit)
  }

  return contracts
}
