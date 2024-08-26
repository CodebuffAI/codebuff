import { sortBy } from 'lodash'

import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getCutoff } from 'common/period'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

export const getUserPortfolioHistory: APIHandler<
  'get-user-portfolio-history'
> = async (props) => {
  const pg = createSupabaseDirectClient()
  const { userId, period } = props

  const startDate = new Date(getCutoff(period)).toISOString()

  const data = await pg.map(
    `select *
    from user_portfolio_history
    where
      user_id = $1
      and ts > $2
    order by random()
    limit 1000`,
    [userId, startDate],
    convertPortfolioHistory
  )

  return sortBy(data, 'timestamp')
}
