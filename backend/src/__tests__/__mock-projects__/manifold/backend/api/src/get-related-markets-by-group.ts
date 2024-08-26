import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { convertContract } from 'common/supabase/contracts'
import { HOUR_MS } from 'common/util/time'
import { log } from 'shared/monitoring/log'
import { getContractsDirect } from 'shared/supabase/contracts'
import { cleanContractForStaticProps } from 'api/get-related-markets'

type cacheType = {
  groupContractIds: string[]
  lastUpdated: number
}
const cachedRelatedMarkets = new Map<string, cacheType>()

export const getRelatedMarketsByGroup: APIHandler<
  'get-related-markets-by-group'
> = async (props) => {
  const { contractId, limit, offset } = props
  const key = contractId + offset + limit
  const pg = createSupabaseDirectClient()
  const cachedResults = cachedRelatedMarkets.get(key)
  if (cachedResults && cachedResults.lastUpdated > Date.now() - HOUR_MS) {
    return refreshedRelatedMarkets(contractId, cachedResults, pg)
  }

  const query = `
    with group_related as (
      select distinct on (other_contracts.importance_score, other_contracts.slug) 
        other_contracts.data,
        other_contracts.importance_score,
        other_contracts.slug
      from contracts
        join group_contracts on contracts.id = group_contracts.contract_id
        join contracts as other_contracts on other_contracts.id in (
          select gc.contract_id
          from group_contracts gc
          where gc.group_id in (
            select group_id
            from group_contracts
            where contract_id = $1
          )
        )
      where contracts.id = $1
        and is_valid_contract(other_contracts)
        and other_contracts.id != $1
        and other_contracts.creator_id != contracts.creator_id
    ),
    group_and_creator_related as (
      select distinct on (other_contracts.importance_score, other_contracts.slug) 
        other_contracts.data,
        other_contracts.importance_score,
        other_contracts.slug
      from contracts
        join group_contracts on contracts.id = group_contracts.contract_id
        join contracts as other_contracts on other_contracts.id in (
          select gc.contract_id
          from group_contracts gc
          where gc.group_id in (
            select group_id
            from group_contracts
            where contract_id = $1
          )
        )
      where contracts.id = $1
        and is_valid_contract(other_contracts)
        and other_contracts.id != $1
        and other_contracts.creator_id = contracts.creator_id
    ),
    combined_results as (
      select * from group_related
      union all
      select * from group_and_creator_related
    )
    select data
    from combined_results
    order by importance_score desc, slug
    offset $3 limit $2
  `
  const groupContracts = await pg.map(
    query,
    [contractId, limit, offset],
    convertContract
  )

  cachedRelatedMarkets.set(key, {
    groupContractIds: groupContracts.map((c) => c.id),
    lastUpdated: Date.now(),
  })
  return {
    groupContracts,
  }
}

const refreshedRelatedMarkets = async (
  contractId: string,
  cachedResults: cacheType,
  pg: SupabaseDirectClient
) => {
  log('returning cached related markets', { contractId })
  const refreshedContracts = await getContractsDirect(
    cachedResults.groupContractIds,
    pg
  )
  return {
    groupContracts: refreshedContracts.map(cleanContractForStaticProps),
  }
}
