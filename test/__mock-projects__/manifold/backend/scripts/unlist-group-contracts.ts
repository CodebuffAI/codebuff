import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Contract } from 'common/contract'

const firestore = admin.firestore()

async function unlistContractsInGroup() {
  console.log('Updating some contracts to be unlisted')

  const snapshot = await firestore
    .collection('contracts')
    .where('groupSlugs', 'array-contains', 'fantasy-football-stock-exchange')
    .get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    console.log('Updating', contract.question)
    await contractRef.update({ visibility: 'unlisted' })
  }
}

if (require.main === module) unlistContractsInGroup().then(() => process.exit())
