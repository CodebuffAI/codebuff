import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Column } from 'common/supabase/utils'
import { toLiteMarket } from 'common/api/market-types'
import { type APIHandler } from './helpers/endpoint'
import {
  join,
  orderBy,
  select,
  where,
  limit as lim,
  renderSql,
  from,
} from 'shared/supabase/sql-builder'
import { buildArray } from 'common/util/array'

const SORT_COLUMNS = {
  'created-time': 'created_time',
  'updated-time': 'last_updated_time',
  'last-bet-time': 'last_bet_time',
  'last-comment-time': 'last_comment_time',
} as const

// mqp: this pagination approach is technically incorrect if multiple contracts
// have the exact same createdTime, but that's very unlikely
const getBeforeValue = async <T extends Column<'contracts'>>(
  pg: SupabaseDirectClient,
  beforeId: string | undefined,
  sortColumn: T
) => {
  if (beforeId) {
    return pg.oneOrNone(
      `select ${sortColumn} from contracts where id = $1`,
      [beforeId],
      (r) => (r ? new Date(r[sortColumn]).toISOString() : undefined)
    )
  } else {
    return undefined
  }
}

// Only fetches contracts with 'public' visibility
export const getMarkets: APIHandler<'markets'> = async ({
  limit,
  userId,
  groupId,
  before,
  sort,
  order,
}) => {
  const pg = createSupabaseDirectClient()
  const sortColumn = SORT_COLUMNS[sort ?? 'created-time']
  const beforeVal = before
    ? await getBeforeValue(pg, before, sortColumn)
    : undefined

  const q = buildArray(
    select('contracts.data'),
    from('contracts'),
    where(`visibility = 'public'`),
    groupId &&
      join('group_contracts on group_contracts.contract_id = contracts.id'),
    groupId && where('group_contracts.group_id = ${groupId}', { groupId }),
    userId && where('creator_id = ${userId}', { userId }),
    beforeVal !== undefined && where(`${sortColumn} < $1`, [beforeVal]),
    orderBy(`${sortColumn} ${order ?? 'desc'} nulls last`),
    limit && lim(limit)
  )
  const query = renderSql(q)
  return await pg.map(query, [], (r) => toLiteMarket(r.data))
}
