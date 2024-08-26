import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const contractsRef = firestore.collection('contracts')
  contractsRef.get().then(async (contractsSnaps) => {

    console.log(`Loaded ${contractsSnaps.size} contracts.`)

    const needsFilling = contractsSnaps.docs.filter((ct) => {
      return !('subsidyPool' in ct.data())
    })

    console.log(`Found ${needsFilling.length} contracts to update.`)
    await Promise.all(
      needsFilling.map((ct) => ct.ref.update({ subsidyPool: 0 }))
    )

    console.log(`Updated all contracts.`)
  })
}
