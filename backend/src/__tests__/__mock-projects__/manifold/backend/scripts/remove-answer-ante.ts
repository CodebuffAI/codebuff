import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { getValues } from 'shared/utils'

async function removeAnswerAnte() {
  const firestore = admin.firestore()
  console.log('Removing isAnte from bets on answers')

  const contracts = await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('outcomeType', '==', 'FREE_RESPONSE')
  )

  console.log('Loaded', contracts, 'contracts')

  for (const contract of contracts) {
    const betsSnapshot = await firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('bets')
      .get()

    console.log('updating', contract.question)

    for (const doc of betsSnapshot.docs) {
      const bet = doc.data() as Bet
      if (bet.isAnte && bet.outcome !== '0') {
        console.log('updating', bet.outcome)
        await doc.ref.update('isAnte', false)
      }
    }
  }
}

if (require.main === module) {
  removeAnswerAnte().then(() => process.exit())
}
