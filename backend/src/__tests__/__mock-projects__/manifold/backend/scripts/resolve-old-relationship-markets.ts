import { runScript } from './run-script'
import { Contract } from 'common/contract'
import { manifoldLoveUserId } from 'common/love/constants'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const oldLoveContracts = await pg.map<Contract>(
      `
    select data from contracts
    where data->>'loverUserId1' is not null
    and outcome_type = 'BINARY'
    and resolution is null
    `,
      [manifoldLoveUserId],
      (r) => r.data
    )
    console.log('oldLoveContracts', oldLoveContracts.length)

    const manifoldLoveUser = await getUser(manifoldLoveUserId)
    if (!manifoldLoveUser) throw new Error('Manifold Love user not found')

    for (const contract of oldLoveContracts) {
      console.log('resolving', contract.id, contract.slug, contract.question)

      await resolveMarketHelper(contract, manifoldLoveUser, manifoldLoveUser, {
        outcome: 'CANCEL',
      })
    }
  })
}
