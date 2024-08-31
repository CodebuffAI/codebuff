// Fixing incorrect IDs in the document data, e.g. in the `bets` collection group.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, processPartitioned } from 'shared/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

initAdmin()

const firestore = admin.firestore()

async function processGroup(group: admin.firestore.CollectionGroup) {
  const writer = new SafeBulkWriter()
  await processPartitioned(group, 100, async (docs) => {
    const mismatchedIds = docs.filter((d) => d.id !== d.get('id'))
    if (mismatchedIds.length > 0) {
      log(`Found ${mismatchedIds.length} docs with mismatched IDs.`)
      for (const doc of mismatchedIds) {
        writer.update(doc.ref, { id: doc.id })
      }
    }
  })
  await writer.close()
}
if (require.main === module) {
  processGroup(firestore.collectionGroup('bets'))
}
