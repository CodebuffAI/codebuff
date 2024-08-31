import * as admin from 'firebase-admin'
import { sortBy } from 'lodash'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Bet } from 'common/bet'
import { getDpmProbability } from 'common/calculate-dpm'
import { DPMBinaryContract } from 'common/contract'

type DocRef = admin.firestore.DocumentReference
const firestore = admin.firestore()

async function migrateContract(
  contractRef: DocRef,
  contract: DPMBinaryContract
) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const lastBet = sortBy(bets, (bet) => -bet.createdTime)[0]
  if (lastBet) {
    const probAfter = getDpmProbability(contract.totalShares)

    await firestore
      .doc(`contracts/${contract.id}/bets/${lastBet.id}`)
      .update({ probAfter })

    console.log('updating last bet from', lastBet.probAfter, 'to', probAfter)
  }
}

async function migrateContracts() {
  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as DPMBinaryContract)

  console.log('Loaded contracts', contracts.length)

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    console.log('contract', contract.question)

    await migrateContract(contractRef, contract)
  }
}

if (require.main === module) migrateContracts().then(() => process.exit())
