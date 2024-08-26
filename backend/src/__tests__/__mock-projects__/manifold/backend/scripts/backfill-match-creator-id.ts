import { Bet } from 'common/bet'
import { runScript } from './run-script'
import { Contract } from 'common/contract'
import { manifoldLoveUserId } from 'common/love/constants'
import { filterDefined } from 'common/util/array'
import { sortBy } from 'lodash'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const loveContracts = await pg.map<Contract>(
      `
    select data from contracts
    where data->>'loverUserId1' is not null
    and outcome_type = 'MULTIPLE_CHOICE'
    and data->>'matchCreatorId' = $1
    `,
      [manifoldLoveUserId],
      (r) => r.data
    )
    console.log('loveContracts', loveContracts.length)

    const getFirstBettor = async (contract: Contract) => {
      const bet = await pg.oneOrNone<Bet>(
        `
      select data from contract_bets
      where contract_id = $1
      order by created_time asc
      offset 1
      limit 1
      `,
        [contract.id],
        (r) => (r ? r.data : null)
      )
      if (!bet) return manifoldLoveUserId
      return bet.userId
    }

    for (const contract of loveContracts) {
      const { loverUserId1, loverUserId2 } = contract
      if (loverUserId1 && loverUserId2) {
        const originalMatchContracts = await pg.map<Contract>(
          `
    select data from contracts
    where data->>'loverUserId1' = $1
    and data->>'loverUserId2' = $2
    and outcome_type = 'BINARY'
    `,
          [loverUserId1, loverUserId2],
          (r) => (r ? r.data : null)
        )
        const definedContracts = filterDefined(originalMatchContracts)
        const lastDefinedContract = sortBy(
          definedContracts,
          (c) => c.createdTime
        )[definedContracts.length - 1]
        if (!lastDefinedContract) continue

        console.log(
          'original contract',
          lastDefinedContract.id,
          lastDefinedContract.slug,
          lastDefinedContract.question
        )

        const firstBettorId = await getFirstBettor(lastDefinedContract)
        console.log('first bettor', firstBettorId)
        await firestore.collection('contracts').doc(contract.id).update({
          matchCreatorId: firstBettorId,
        })
      }
    }

    // for (const contract of loverContracts) {
    //   const firstBettorId = await getFirstBettor(contract)
    //   if (contract.matchCreatorId === firstBettorId) continue
    //   console.log(
    //     'contract',
    //     contract.id,
    //     contract.question,
    //     contract.slug,
    //     'matchCreatorId',
    //     contract.matchCreatorId,
    //     'firstBettorId',
    //     firstBettorId
    //   )
    //   // await firestore.collection('contracts').doc(contract.id).update({
    //   //   matchCreatorId: manifoldLoveUserId,
    //   // })
    // }

    console.log('Done')
  })
}
