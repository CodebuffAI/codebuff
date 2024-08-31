import { SupabaseClient, millisToTs, run, tsToMillis, Row } from './utils'
import { PortfolioMetrics } from 'common/portfolio-metrics'

export async function getPortfolioHistory(
  userId: string,
  start: number,
  db: SupabaseClient,
  end?: number
) {
  let query = db
    .from('user_portfolio_history')
    .select('*')
    .eq('user_id', userId)
    .gt('ts', millisToTs(start))
  if (end) {
    query = query.lt('ts', new Date(end).toISOString())
  }
  query = query.order('ts', { ascending: true })

  const { data } = await run(query)
  return data.map(convertPortfolioHistory)
}

export async function getCurrentPortfolio(userId: string, db: SupabaseClient) {
  const query = db
    .from('user_portfolio_history_latest')
    .select('*')
    .eq('user_id', userId)

  const { data } = await run(query)
  const [d] = data
  if (!d) return null
  return convertPortfolioHistory(d)
}

export const convertPortfolioHistory = (
  row: Row<'user_portfolio_history' | 'user_portfolio_history_latest'>
) => {
  return {
    // mqp: hack for temporary unwise choice of postgres timestamp without time zone type
    // -- we have to make it look like an ISO9601 date or the JS date constructor will
    // assume that it's in local time. will fix this up soon
    timestamp: tsToMillis(row.ts + '+0000'),
    investmentValue: +(row.investment_value ?? 0),
    totalDeposits: +(row.total_deposits ?? 0),
    balance: +(row.balance ?? 0),
    spiceBalance: +row.spice_balance,
    loanTotal: +(row.loan_total ?? 0),
    profit: row.profit ? Number(row.profit) : undefined,
    cashInvestmentValue: row.cash_investment_value ?? 0,
    totalCashDeposits: row.total_cash_deposits ?? 0,
    cashBalance: row.cash_balance ?? 0,
  } as PortfolioMetrics
}
