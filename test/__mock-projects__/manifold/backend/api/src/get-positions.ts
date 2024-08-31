import { APIError, type APIHandler } from './helpers/endpoint'

import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { buildArray } from 'common/util/array'
import {
  from,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { log } from 'shared/utils'
import { getIp } from 'shared/analytics'

export const getPositions: APIHandler<'market/:id/positions'> = async (
  props,
  _,
  req
) => {
  const { id: contractId } = props

  if (contractId === 'U3zLgOZkGUE7cvG98961') {
    throw new APIError(404, `We're done with whales vs minnows, sorry!`)
  }
  log('getPositions from ip:', getIp(req))
  const pg = createSupabaseDirectClient()
  const { top, bottom, userId, answerId, order } = props

  return await getOrderedContractMetricRowsForContractId(pg, contractId, {
    top,
    userId,
    answerId,
    bottom,
    order,
  })
}

const getOrderedContractMetricRowsForContractId = async (
  pg: SupabaseDirectClient,
  contractId: string,
  options: {
    userId?: string
    answerId?: string
    order?: 'profit' | 'shares'
    top?: number
    bottom?: number
  }
) => {
  const { userId, top, bottom, answerId, order = 'profit' } = options

  const sharedConditions = buildArray(
    select('data'),
    from('user_contract_metrics'),
    where('contract_id = ${contractId}', { contractId }),
    userId && where('user_id = ${userId}', { userId }),
    answerId
      ? where('answer_id = ${answerId}', { answerId })
      : where('answer_id is null')
  )

  if (userId) {
    return pg.map(renderSql(...sharedConditions), [], (r) => r.data)
  }

  const query1 = renderSql(
    ...sharedConditions,
    order === 'profit' && where(`profit > 0`),
    order === 'profit' && orderBy(`profit desc nulls last`),
    order === 'shares' && where('has_yes_shares = true'),
    order === 'shares' && orderBy(`total_shares_yes desc nulls last`),
    top !== undefined && limit(top)
  )

  const query2 = renderSql(
    ...sharedConditions,
    order === 'profit' && where(`profit < 0`),
    order === 'profit' && orderBy(`profit asc nulls last`),
    order === 'shares' && where('has_no_shares = true'),
    order === 'shares' && orderBy(`total_shares_no desc nulls last`),
    bottom !== undefined && limit(bottom)
  )

  const [positiveResults, negativeResults] = await Promise.all([
    pg.map(query1, [], (r) => r.data),
    pg.map(query2, [], (r) => r.data),
  ])

  return [...positiveResults, ...negativeResults]
}
