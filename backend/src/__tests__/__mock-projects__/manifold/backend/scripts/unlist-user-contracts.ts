import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Contract } from 'common/contract'

const firestore = admin.firestore()

async function unlistUserContracts(userId: string) {
  console.log('Updating contracts to be unlisted from user', userId)

  const snapshot = await firestore
    .collection('contracts')
    .where('creatorId', '==', userId)
    .get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')
  await Promise.all(
    contracts.map(async (contract) => {
      const contractRef = firestore.doc(`contracts/${contract.id}`)

      console.log('Updating', contract.question)
      await contractRef.update({ visibility: 'unlisted' })
    })
  )
}

if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length != 1) {
    console.log('Usage: unlist-user-contracts [userid]')
  } else {
    unlistUserContracts(args[0]).catch((e) => console.error(e))
  }
}
