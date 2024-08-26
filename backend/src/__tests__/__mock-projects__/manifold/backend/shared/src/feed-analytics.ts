import { SupabaseDirectClient } from 'shared/supabase/init'
import { ENV_CONFIG } from 'common/envs/constants'
import { VIEW_RECORDINGS_START } from 'common/feed'
import * as dayjs from 'dayjs'

export const getFeedConversionScores = async (
  pg: SupabaseDirectClient,
  start: string, // YYYY-MM-DD
  end: string
) => {
  const { adminIds } = ENV_CONFIG

  const minDate = dayjs(VIEW_RECORDINGS_START)
    .tz('America/Los_Angeles')
    .endOf('day')
    .format('YYYY-MM-DD')

  const realStart = start < minDate ? minDate : start

  return await pg.manyOrNone<{
    start_date: string
    feed_conversion: number
  }>(
    `with interacts as (
      select
        date_trunc('day', created_time at time zone 'america/los_angeles')::date as start_date,
        count(name) as count
      from user_contract_interactions
      where
        name in ('card click', 'card bet', 'card like')
        and created_time >= date_to_midnight_pt($1)
        and created_time < date_to_midnight_pt($2)
        and user_id not in ($3:list)
      group by start_date
    ),
    views as (
      select
        date_trunc('day', created_time at time zone 'america/los_angeles')::date as start_date,
        count(*)
      from user_view_events
      where
        name = 'card'
        and created_time >= date_to_midnight_pt($1)
        and created_time < date_to_midnight_pt($2)
        and user_id not in ($3:list)
      group by start_date
    )
    select
      i.start_date, i.count / v.count::numeric as feed_conversion
      from interacts i join views v
    on i.start_date = v.start_date`,
    [realStart, end, adminIds]
  )
}
