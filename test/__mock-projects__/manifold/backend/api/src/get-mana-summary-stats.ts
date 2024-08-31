import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Row } from 'common/supabase/utils'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

export const getManaSummaryStats: APIHandler<'get-mana-summary-stats'> = async (
  props
) => {
  const { limitDays } = props
  const start = dayjs()
    .tz('America/Los_Angeles')
    .subtract(limitDays, 'day')
    .startOf('day')
    .toISOString()

  const pg = createSupabaseDirectClient()
  return await pg.map(
    `
    select * from mana_supply_stats
     where start_time >= $1
    order by start_time
  `,
    [start],
    (row) => row as Row<'mana_supply_stats'>
  )
}
