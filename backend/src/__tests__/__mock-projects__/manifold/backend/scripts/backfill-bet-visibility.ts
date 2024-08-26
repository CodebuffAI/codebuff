import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { processPartitioned } from 'shared/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

initAdmin()

const firestore = admin.firestore()

async function processGroup(group: admin.firestore.CollectionGroup) {
  const writer = new SafeBulkWriter()
  await processPartitioned(group, 100, async (docs) => {
    for (const doc of docs) {
      const betVisibility = await doc.get('visibility')
      console.log(betVisibility)
      if (!betVisibility) {
        const contract = await doc.ref.parent.parent?.get()
        const contractVisibility = await contract?.get('visibility')
        if (contractVisibility != betVisibility || !contractVisibility) {
          console.log(
            'MISMATCH',
            betVisibility,
            contractVisibility,
            doc.get('id')
          )
          writer.update(doc.ref, { visibility: contractVisibility ?? 'public' })
        }
      }
    }
  })
  await writer.close()
}
if (require.main === module) {
  processGroup(firestore.collectionGroup('bets'))
}
