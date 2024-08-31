import * as admin from 'firebase-admin'
import { sumBy } from 'lodash'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'

type DocRef = admin.firestore.DocumentReference

const firestore = admin.firestore()

async function recalculateContract(contractRef: DocRef, contract: Contract) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const openBets = bets.filter((b) => !b.isSold && !b.sale)

  const totalShares = {
    YES: sumBy(openBets, (bet) => (bet.outcome === 'YES' ? bet.shares : 0)),
    NO: sumBy(openBets, (bet) => (bet.outcome === 'NO' ? bet.shares : 0)),
  }

  const totalBets = {
    YES: sumBy(openBets, (bet) => (bet.outcome === 'YES' ? bet.amount : 0)),
    NO: sumBy(openBets, (bet) => (bet.outcome === 'NO' ? bet.amount : 0)),
  }

  await contractRef.update({ totalShares, totalBets })

  console.log(
    'calculating totals for "',
    contract.question,
    '" total bets:',
    totalBets
  )
  console.log()
}

async function recalculateContractTotals() {
  console.log('Recalculating contract info')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    await recalculateContract(contractRef, contract)
  }
}

if (require.main === module)
  recalculateContractTotals().then(() => process.exit())
