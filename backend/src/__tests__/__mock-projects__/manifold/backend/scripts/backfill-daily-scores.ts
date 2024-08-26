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
      return !('dailyScore' in ct.data()) || ct.data().dailyScore == null
    })
    log(`${needsFilling.length} contracts need daily scores.`)
    const updates = needsFilling.map((group) => {
      return { doc: group.ref, fields: { dailyScore: 0 } }
    })
    log(`Updating ${updates.length} contracts.`)
    await writeAsync(firestore, updates)
    log(`Updated all contracts.`)
  })
}
