import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Row } from 'common/supabase/utils'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)
import { sortBy } from 'lodash'

export const getTxnSummaryStats: APIHandler<'get-txn-summary-stats'> = async (
  props
) => {
  const { ignoreCategories, fromType, toType, limitDays } = props
  const start = dayjs()
    .tz('America/Los_Angeles')
    .subtract(limitDays, 'day')
    .startOf('day')
    .toISOString()

  const pg = createSupabaseDirectClient()
  return sortBy(
    await pg.map(
      `
    select * from txn_summary_stats
     where ($1 is null or from_type = $1)
     and ($2 is null or category not in ($2:list))
     and ($3 is null or to_type = $3)
     and start_time >= $4
    order by start_time desc 
  `,
      [fromType, ignoreCategories ?? null, toType, start],
      (row) => row as Row<'txn_summary_stats'>
    ),
    'start_time'
  )
}
