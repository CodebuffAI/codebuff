import { chunk } from 'lodash'
import { runScript } from './run-script'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const usersWithNoLatestPortfolio = await pg.map(
      `select id from users
      left join user_portfolio_history_latest on users.id = user_portfolio_history_latest.user_id
      where user_portfolio_history_latest.user_id is null`,
      [],
      (r: any) => r.id as string
    )
    console.log('usersWithNoLatestPortfolio', usersWithNoLatestPortfolio)

    const userIdChunks = chunk(usersWithNoLatestPortfolio, 20)
    let i = 0
    for (const userIds of userIdChunks) {
      const portfolios = await Promise.all(
        userIds.map(async (userId) => ({
          userId,
          ...(await getUserPortfolioInternal(userId)),
        }))
      )
      i += portfolios.length
      console.log(
        'got portfolios',
        i,
        'of',
        userIdChunks.length * 20
      )
      await pg.none(
        `insert into user_portfolio_history_latest (user_id, balance, spice_balance, investment_value, loan_total, total_deposits, ts)
        values ${portfolios
          .map(
            (_, i) =>
              `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${
                i * 7 + 5
              }, $${i * 7 + 6}, $${i * 7 + 7})`
          )
          .join(', ')}
        on conflict (user_id) do nothing`,
        portfolios.flatMap((p) => [
          p.userId,
          p.balance,
          p.spiceBalance ?? 0,
          p.investmentValue,
          p.loanTotal,
          p.totalDeposits,
          new Date(p.timestamp).toISOString(),
        ])
      )
    }
  })
}
