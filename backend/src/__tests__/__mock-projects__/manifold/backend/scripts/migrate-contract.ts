import * as admin from 'firebase-admin'
import { sumBy } from 'lodash'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'

type DocRef = admin.firestore.DocumentReference

const firestore = admin.firestore()

async function migrateBet(contractRef: DocRef, bet: Bet) {
  const { dpmWeight, amount, id } = bet as Bet & { dpmWeight: number }
  const shares = dpmWeight + amount

  await contractRef.collection('bets').doc(id).update({ shares })
}

async function migrateContract(contractRef: DocRef) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const totalShares = {
    YES: sumBy(bets, (bet) => (bet.outcome === 'YES' ? bet.shares : 0)),
    NO: sumBy(bets, (bet) => (bet.outcome === 'NO' ? bet.shares : 0)),
  }

  await contractRef.update({ totalShares })
}

async function migrateContracts() {
  console.log('Migrating contracts')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded contracts', contracts.length)

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)
    const betsSnapshot = await contractRef.collection('bets').get()
    const bets = betsSnapshot.docs.map((bet) => bet.data() as Bet)

    console.log('contract', contract.question, 'bets', bets.length)

    for (const bet of bets) await migrateBet(contractRef, bet)
    await migrateContract(contractRef)
  }
}

if (require.main === module) migrateContracts().then(() => process.exit())
