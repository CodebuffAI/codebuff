import { runScript } from './run-script'
import { CPMMMultiContract } from 'common/contract'
import { Bet } from 'common/bet'
import { updateContractMetricsForUsers } from 'shared/helpers/user-contract-metrics'
import { revalidateContractStaticProps } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const resolvedContracts = await pg.map<CPMMMultiContract>(
      `
      select data from contracts
      where resolution is not null
      and mechanism = 'cpmm-multi-1'
      and data->>'shouldAnswersSumToOne' = 'false'
    `,
      [],
      (r) => r.data
    )

    console.log('got', resolvedContracts.length, 'contracts')

    for (const contract of resolvedContracts) {
      const bets = await pg.map<Bet>(
        `
        select data from contract_bets
        where contract_id = $1
      `,
        [contract.id],
        (r) => r.data
      )

      console.log(
        'updating',
        contract.id,
        contract.slug,
        contract.question,
        'bets',
        bets.length
      )
      await updateContractMetricsForUsers(contract, bets)
      await revalidateContractStaticProps(contract)
    }
  })
}
