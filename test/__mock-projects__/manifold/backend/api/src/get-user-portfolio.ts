import { type APIHandler } from './helpers/endpoint'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'

export const getUserPortfolio: APIHandler<'get-user-portfolio'> = async (
  props
) => {
  return await getUserPortfolioInternal(props.userId)
}

// Below is the start of the calculation of investment value in just sql.
// Once this works, we can stop using the computeInvestmentValue function.
// TODO(James): Add dpm share value or migrate off dpm.
// TODO(James): Figure out why this investment calculation is different from user-contract-metrics.ts.
// Could be that user_contract_metrics is not correctly summarizing contract_bets.
// const investment = await pg.one(
//   `select
//     sum(
//       case
//         when answers.prob is not null then
//           coalesce(total_shares_yes, 0) * answers.prob
//           + coalesce(total_shares_no, 0) * (1 - answers.prob)
//         else
//           coalesce(total_shares_yes, 0) * (contracts.data->>'prob')::numeric
//           + coalesce(total_shares_no, 0) * (1 - (contracts.data->>'prob')::numeric)
//       end
//     ) as total_investment_value
//   from user_contract_metrics ucm
//   join contracts on ucm.contract_id = contracts.id
//   left join answers on ucm.answer_id = answers.id
//   where
//     ucm.user_id = $1
//     and contracts.resolution is null
//     and (contracts.mechanism = 'cpmm-multi-1' or contracts.mechanism = 'cpmm-1')
//     and has_shares = true`,
//   [userId],
//   (r) => Number(r.total_investment_value)
// )

// const portfolioHistory = await pg.oneOrNone(
//   `SELECT DISTINCT ON (user_id) user_id, investment_value, loan_total, balance, spice_balance, total_deposits, ts
//   FROM user_portfolio_history
//   WHERE user_id = $1
//   ORDER BY user_id, ts DESC`,
//   [userId]
// )
