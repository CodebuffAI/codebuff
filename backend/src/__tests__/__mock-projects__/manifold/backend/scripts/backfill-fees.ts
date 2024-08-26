// We have many old contracts without a collectedFees data structure. Let's fill them in.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { noFees } from 'common/fees'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const contractsRef = firestore.collection('contracts')
  contractsRef.get().then(async (contractsSnaps) => {
    console.log(`Loaded ${contractsSnaps.size} contracts.`)
    const needsFilling = contractsSnaps.docs.filter((ct) => {
      return !('collectedFees' in ct.data())
    })
    console.log(`Found ${needsFilling.length} contracts to update.`)
    await Promise.all(
      needsFilling.map((ct) => ct.ref.update({ collectedFees: noFees }))
    )
    console.log(`Updated all contracts.`)
  })
}
