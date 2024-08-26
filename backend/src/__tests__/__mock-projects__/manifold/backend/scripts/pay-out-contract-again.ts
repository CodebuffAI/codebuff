import * as admin from 'firebase-admin'
import { flatten, groupBy, sumBy, mapValues } from 'lodash'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { getLoanPayouts, getPayouts } from 'common/payouts'
import { filterDefined } from 'common/util/array'

type DocRef = admin.firestore.DocumentReference

const firestore = admin.firestore()

async function checkIfPayOutAgain(contractRef: DocRef, contract: Contract) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const openBets = bets.filter((b) => !b.isSold && !b.sale)
  const loanedBets = openBets.filter((bet) => bet.loanAmount)

  if (loanedBets.length && contract.resolution) {
    const { resolution, resolutions, resolutionProbability } = contract as any

    const { payouts } = getPayouts(
      resolution,
      contract,
      openBets,
      [],
      resolutions,
      resolutionProbability
    )

    const loanPayouts = getLoanPayouts(openBets)
    const groups = groupBy(
      [...payouts, ...loanPayouts],
      (payout) => payout.userId
    )
    const userPayouts = mapValues(groups, (group) =>
      sumBy(group, (g) => g.payout)
    )

    const entries = Object.entries(userPayouts)
    const firstNegative = entries.findIndex(([_, payout]) => payout < 0)
    const toBePaidOut = firstNegative === -1 ? [] : entries.slice(firstNegative)

    if (toBePaidOut.length) {
      console.log(
        'to be paid out',
        toBePaidOut.length,
        'already paid out',
        entries.length - toBePaidOut.length
      )
      const positivePayouts = toBePaidOut.filter(([_, payout]) => payout > 0)
      if (positivePayouts.length)
        return { contract, toBePaidOut: positivePayouts }
    }
  }
  return undefined
}

async function payOutContractAgain() {
  console.log('Recalculating contract info')

  const snapshot = await firestore.collection('contracts').get()

  const [startTime, endTime] = [
    new Date('2022-03-02'),
    new Date('2022-03-07'),
  ].map((date) => date.getTime())

  const contracts = snapshot.docs
    .map((doc) => doc.data() as Contract)
    .filter((contract) => {
      const { resolutionTime } = contract
      return (
        resolutionTime && resolutionTime > startTime && resolutionTime < endTime
      )
    })

  console.log('Loaded', contracts.length, 'contracts')

  const toPayOutAgain = filterDefined(
    await Promise.all(
      contracts.map(async (contract) => {
        const contractRef = firestore.doc(`contracts/${contract.id}`)

        return await checkIfPayOutAgain(contractRef, contract)
      })
    )
  )

  const flattened = flatten(toPayOutAgain.map((d) => d.toBePaidOut))

  for (const [userId, payout] of flattened) {
    console.log('Paying out', userId, payout)
    // await payUser(userId, payout)
  }
}

if (require.main === module) payOutContractAgain().then(() => process.exit())
