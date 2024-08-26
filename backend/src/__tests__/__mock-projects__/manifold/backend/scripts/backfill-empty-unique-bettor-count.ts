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
        !('uniqueBettorCount' in ct.data()) ||
        ct.data().uniqueBettorCount == null
      )
    })
    log(`${needsFilling.length} contracts need unique bettor counts.`)
    const updates = needsFilling.map((group) => {
      return { doc: group.ref, fields: { uniqueBettorCount: 0 } }
    })
    log(`Updating ${updates.length} contracts.`)
    await writeAsync(firestore, updates)
    log(`Updated all contracts.`)
  })
}
