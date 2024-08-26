import { Contract, DpmMultipleChoiceContract } from 'common/contract'
import { runScript } from './run-script'
import { log } from 'shared/utils'
import { Bet } from 'common/bet'
import { readJson } from 'shared/helpers/file'
import { calculateDpmPayout } from 'common/calculate-dpm'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    log('Fixing shares multi DPM')

    const jsonData = (await readJson('dpm-market-data.json')) as any
    const contractIds = Object.keys(jsonData).filter(
      (k) => !k.includes('-bets') && !k.includes('-answers')
    )
    const contracts = contractIds.map((id) => jsonData[id] as Contract)
    const betsByContractId = Object.fromEntries(
      contractIds.map((id) => [id, jsonData[`${id}-bets`] as Bet[]] as const)
    )
    console.log('Got json data', Object.keys(jsonData))

    for (const contract of contracts) {
      const bets = betsByContractId[contract.id]

      const getSoldBetPayout = (bet: Bet) => {
        const soldBet = bets.find((b) => bet.sale?.betId === b.id)
        return soldBet
          ? -soldBet.amount / Math.sqrt(soldBet.probBefore * soldBet.probAfter)
          : 0
      }

      const bulkWriter = firestore.bulkWriter()
      for (const bet of bets) {
        let newShares = bet.sale
          ? getSoldBetPayout(bet)
          : bet.isSold
          ? bet.amount / Math.sqrt(bet.probBefore * bet.probAfter) // make up fake share qty
          : calculateDpmPayout(
              contract as DpmMultipleChoiceContract,
              bet,
              bet.outcome
            )
        if (isNaN(newShares) || !isFinite(newShares)) {
          newShares = bet.amount / (bet.probBefore + bet.probAfter)
          if (isNaN(newShares) || !isFinite(newShares)) {
            newShares = bet.amount
          }
        }
        if (isNaN(newShares) || !isFinite(newShares)) {
          console.log(
            'NAN shares',
            newShares,
            'amount',
            bet.amount,
            'probBefore',
            bet.probBefore,
            'probAfter',
            bet.probAfter
          )
        }

        bulkWriter.update(
          firestore
            .collection('contracts')
            .doc(contract.id)
            .collection('bets')
            .doc(bet.id),
          {
            shares: newShares,
          }
        )
      }
      bulkWriter.update(firestore.collection('contracts').doc(contract.id), {
        wasDpm: true,
      })

      await bulkWriter.close()

      console.log('Updated', contract.slug)
    }
  })
}
