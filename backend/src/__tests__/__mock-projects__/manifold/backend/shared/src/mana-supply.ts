import { createSupabaseDirectClient } from 'shared/supabase/init'
import { chunk } from 'lodash'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { log } from 'shared/utils'

export const getManaSupply = async (recalculateAllUserPortfolios: boolean) => {
  const pg = createSupabaseDirectClient()
  if (recalculateAllUserPortfolios) {
    const allUserIdsWithInvestments = await pg.map(
      `
          select distinct u.id from users u
           join user_contract_metrics ucm on u.id = ucm.user_id
           join contracts c on ucm.contract_id = c.id
          where u.data->'lastBetTime' is not null
          and c.resolution_time is null;
      `,
      [],
      (r) => r.id as string
    )
    const chunks = chunk(allUserIdsWithInvestments, 1000)
    let processed = 0
    for (const userIds of chunks) {
      await updateUserMetricsCore(userIds)
      processed += userIds.length
      log(`Processed ${processed} of ${allUserIdsWithInvestments.length} users`)
    }
  }
  const userPortfolio = await pg.one(
    `
      select
          sum(u.balance + u.spice_balance + coalesce(uphl.investment_value, 0)) as total_value,
          sum(u.balance) as balance,
          sum(u.spice_balance) as spice_balance,
          sum(coalesce(uphl.investment_value, 0)) as investment_value,
          sum(coalesce(uphl.loan_total, 0)) as loan_total
      from users u
      left join user_portfolio_history_latest uphl on u.id = uphl.user_id
      where (u.balance + u.spice_balance + coalesce(uphl.investment_value, 0)) > 0.0
          `,
    [],
    (r: any) => ({
      totalValue: Number(r.total_value),
      balance: Number(r.balance),
      spiceBalance: Number(r.spice_balance),
      investmentValue: Number(r.investment_value),
      loanTotal: Number(r.loan_total),
    })
  )

  const ammLiquidity = await getAMMLiquidity()

  const totalValue = userPortfolio.totalValue + ammLiquidity
  return {
    ...userPortfolio,
    ammLiquidity,
    totalValue,
  }
}

const getAMMLiquidity = async () => {
  const pg = createSupabaseDirectClient()
  const [binaryLiquidity, multiLiquidity] = await Promise.all([
    pg.one(
      `select sum((data->>'prob')::numeric * (data->'pool'->>'YES')::numeric + (1-(data->>'prob')::numeric) *(data->'pool'->>'NO')::numeric + (data->'subsidyPool')::numeric) from contracts
    where resolution is null
    and mechanism = 'cpmm-1'`,
      [],
      (r: any) => Number(r.sum)
    ),
    pg.one(
      `select sum(prob * pool_yes + (1-prob) * pool_no + subsidy_pool) from answers
        join contracts on contract_id = contracts.id
        where contracts.resolution is null`,
      [],
      (r: any) => Number(r.sum)
    ),
  ])

  return binaryLiquidity + multiLiquidity
}
