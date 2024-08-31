import { chunk, sumBy } from 'lodash'
import { runScript } from 'run-script'
import { addContractLiquidity } from 'api/add-subsidy'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const contracts = await pg.map(
      `
    select
      id,
      question,
      (data->>'uniqueBettorCount')::numeric as num_traders,
      (data->>'totalLiquidity')::numeric as total_liquidity
    from contracts
    where
      resolution is null
      and close_time > now()
      and (data->>'isRanked' is null or data->>'isRanked' = 'true')
      and visibility = 'public'
      and (data->>'totalLiquidity')::numeric < 1000
      and (data->>'uniqueBettorCount')::numeric >= 10
    order by num_traders
    `,
      [],
      (r) => ({
        id: r.id as string,
        question: r.question as string,
        numTraders: Number(r.num_traders),
        totalLiquidity: Number(r.total_liquidity),
      })
    )
    const liquidityToAdd = sumBy(contracts, (c) => 1000 - c.totalLiquidity)
    const averageLiquidityToAdd = liquidityToAdd / contracts.length
    console.log(
      'total liquidity to add',
      liquidityToAdd,
      'average',
      averageLiquidityToAdd
    )

    const contractBatches = chunk(contracts, 20)

    const manifoldUserId = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2'
    let liquiditySum = 0
    for (const batch of contractBatches) {
      await Promise.all(
        batch.map((contract) => {
          const liquidityToAdd = 1000 - contract.totalLiquidity
          liquiditySum += liquidityToAdd
          console.log(
            'adding liquidity',
            liquidityToAdd,
            'to',
            contract.question
          )
          return addContractLiquidity(
            contract.id,
            liquidityToAdd,
            manifoldUserId
          )
        })
      )
    }

    console.log(
      `Added ${liquiditySum} liquidity to ${contracts.length} contracts`
    )
  })
}
