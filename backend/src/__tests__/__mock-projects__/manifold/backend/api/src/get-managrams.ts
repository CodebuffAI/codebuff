import { millisToTs } from 'common/supabase/utils'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertTxn } from 'common/supabase/txns'
import { buildArray } from 'common/util/array'
import {
  from,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { ManaPayTxn } from 'common/txn'

export const getManagrams: APIHandler<'managrams'> = async (props) => {
  const { limit: limitValue, toId, fromId, before, after } = props

  const pg = createSupabaseDirectClient()

  const conditions = buildArray(
    where('category = ${category}', { category: 'MANA_PAYMENT' }),
    before && where('created_time < ${before}', { before: millisToTs(before) }),
    after && where('created_time > ${after}', { after: millisToTs(after) }),
    toId && where('to_id = ${toId}', { toId }),
    fromId && where('from_id = ${fromId}', { fromId })
  )

  const query = renderSql(
    select('*'),
    from('txns'),
    ...conditions,
    orderBy('created_time desc'),
    limitValue && limit(limitValue)
  )

  return (await pg.map(query, [], convertTxn)) as ManaPayTxn[]
}
