// Fill all groups without privacyStatus to 'public'

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const contractQuery = firestore.collection('contracts')
  contractQuery.get().then(async (contractSnaps) => {
    log(`Loaded ${contractSnaps.size} groups.`)
    const needsFilling = contractSnaps.docs.filter((ct) => {
      return (
        !('lastUpdatedTime' in ct.data()) || ct.data().lastUpdatedTime == null
      )
    })
    log(`${needsFilling.length} contracts need last updated times.`)
    const updates = needsFilling.map((contract) => {
      return {
        doc: contract.ref,
        fields: { lastUpdatedTime: contract.data().createdTime },
      }
    })
    log(`Updating ${updates.length} contracts.`)
    await writeAsync(firestore, updates)
    log(`Updated all contracts.`)
  })
}
