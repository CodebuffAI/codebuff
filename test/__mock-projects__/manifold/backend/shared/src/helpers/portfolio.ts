import { SupabaseDirectClient } from 'shared/supabase/init'
import { type Row } from 'common/supabase/utils'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

export const getCurrentPortfolio = async (
  pg: SupabaseDirectClient,
  userId: string
) => {
  const portfolio = await pg.oneOrNone<Row<'user_portfolio_history_latest'>>(
    `select * from user_portfolio_history_latest where user_id = $1`,
    [userId]
  )
  if (!portfolio) return null
  return convertPortfolioHistory(portfolio)
}
