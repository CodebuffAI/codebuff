// We used to allow bets to leave off the bet type flags, but that makes it hard to
// query on them in Firestore, so let's fill them in.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, processPartitioned } from 'shared/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

initAdmin()
const firestore = admin.firestore()

async function updateAllBets() {
  const writer = new SafeBulkWriter({ throttling: false })
  const flags = ['isAnte', 'isRedemption']
  let updated = 0
  const bets = firestore.collectionGroup('bets')
  await processPartitioned(bets, 100, async (docs) => {
    for (const doc of docs) {
      let needsUpdate = false
      const update: { [k: string]: boolean } = {}
      for (const flag of flags) {
        const currVal = doc.get(flag) as boolean | undefined
        if (currVal == null) {
          needsUpdate = true
          update[flag] = false
        }
      }
      if (needsUpdate) {
        updated++
        writer.update(doc.ref, update)
      }
    }
  })
  log('Committing writes...')
  await writer.close()
  return updated
}

if (require.main === module) {
  updateAllBets().then((n) => log(`Updated ${n} bets.`))
}
