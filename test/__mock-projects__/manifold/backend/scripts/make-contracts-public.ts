import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Contract } from 'common/contract'

const firestore = admin.firestore()

async function makeContractsPublic() {
  console.log('Updating contracts to be public')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    console.log('Updating', contract.question)
    await contractRef.update({ visibility: 'public' })
  }
}

if (require.main === module) makeContractsPublic().then(() => process.exit())
