import { run } from 'common/supabase/utils'
import { db } from './db'
import { chunk, uniqBy } from 'lodash'
import { convertContract } from 'common/supabase/contracts'

// see also: common/supabase/contracts.ts

export async function getPublicContractIdsInTopics(
  contractIds: string[],
  topicSlugs: string[],
  ignoreSlugs?: string[]
) {
  const contractLists = await Promise.all(
    chunk(contractIds, 100).map(async (ids) => {
      const { data } = await run(
        db.rpc('get_contracts_in_group_slugs_1', {
          contract_ids: ids,
          p_group_slugs: topicSlugs,
          ignore_slugs: ignoreSlugs ?? [],
        })
      )
      if (data && data.length > 0) {
        return data.flat().map((d) => convertContract(d))
      } else {
        return []
      }
    })
  )
  return uniqBy(contractLists.flat(), 'id')
}

export async function getRecentActiveContractsOnTopics(
  topicSlugs: string[],
  ignoreSlugs: string[],
  limit: number
) {
  const { data } = await run(
    db.rpc('get_recently_active_contracts_in_group_slugs_1', {
      p_group_slugs: topicSlugs,
      ignore_slugs: ignoreSlugs,
      max: limit,
    })
  )
  if (data && data.length > 0) {
    return data.flat().map((d) => convertContract(d))
  } else {
    return []
  }
}

export async function getWatchedContracts(userId: string) {
  const { data: ids } = await run(
    db.from('contract_follows').select('contract_id').eq('follow_id', userId)
  )
  const chunks = chunk(
    ids.map((r) => r.contract_id),
    200
  )
  const datas = await Promise.all(
    chunks.map(async (ids) => {
      const { data } = await run(
        db
          .from('contracts')
          .select(
            'id, question, slug, mechanism, data->>creatorId, data->>creatorAvatarUrl'
          )
          .in('id', ids)
          .order('created_time' as any, { ascending: false })
      )
      return data
    })
  )
  return datas.flat()
}

export async function getWatchedContractsCount(userId: string) {
  const { count } = await run(
    db
      .from('contract_follows')
      .select('*', { head: true, count: 'exact' })
      .eq('follow_id', userId)
  )
  return count
}
