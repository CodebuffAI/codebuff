import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { log } from 'shared/utils'
import { getContractsDirect } from 'shared/supabase/contracts'
import { HOUR_MS } from 'common/util/time'

import { orderBy } from 'lodash'
import { TOPIC_SIMILARITY_THRESHOLD } from 'shared/helpers/embeddings'
import { APIHandler } from 'api/helpers/endpoint'

type cacheType = {
  marketIdsFromEmbeddings: string[]
  lastUpdated: number
}
const cachedRelatedMarkets = new Map<string, cacheType>()

// We cache the state of the contracts every 5 minutes via the cache header,
// and the actual contracts to include for an hour via the internal cachedRelatedMarkets.
export const getRelatedMarkets: APIHandler<'get-related-markets'> = async (
  body
) => {
  const { contractId, limit } = body
  log('getting related markets', contractId)
  const pg = createSupabaseDirectClient()
  const cachedResults = cachedRelatedMarkets.get(contractId)
  if (cachedResults && cachedResults.lastUpdated > Date.now() - HOUR_MS) {
    return refreshedRelatedMarkets(contractId, cachedResults, pg)
  }
  const marketsFromEmbeddings = await pg.map(
    `
      select * from close_contract_embeddings(
        input_contract_id := $1,
        match_count := $2,
        similarity_threshold := $3
        )`,
    [contractId, limit, TOPIC_SIMILARITY_THRESHOLD],
    (row) => row.data as Contract
  )

  const orderByNonStonks = (c: Contract) =>
    c.outcomeType !== 'STONK' && !c.question.includes('stock') ? 1 : 0

  cachedRelatedMarkets.set(contractId, {
    marketIdsFromEmbeddings: marketsFromEmbeddings.map((c) => c.id),
    lastUpdated: Date.now(),
  })

  return {
    marketsFromEmbeddings: orderBy(
      marketsFromEmbeddings,
      orderByNonStonks,
      'desc'
    ).map(cleanContractForStaticProps),
  }
}

export const cleanContractForStaticProps = (c: Contract) =>
  ({
    ...c,
    description: '',
    answers: [],
    groupSlugs: [],
  } as Contract)

const refreshedRelatedMarkets = async (
  contractId: string,
  cachedResults: cacheType,
  pg: SupabaseDirectClient
) => {
  log('returning cached related markets', { contractId })
  const refreshedContracts = await getContractsDirect(
    cachedResults.marketIdsFromEmbeddings,
    pg
  )
  return {
    marketsFromEmbeddings: refreshedContracts.map(cleanContractForStaticProps),
  }
}
