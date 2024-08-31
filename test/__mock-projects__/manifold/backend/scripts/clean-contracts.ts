import { FieldValue } from 'firebase-admin/firestore'
import { runScript } from './run-script'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const writer = new SafeBulkWriter()
    const refs = await firestore.collection('contracts').listDocuments()
    console.log(`Updating ${refs.length} contracts.`)
    for (const ref of refs) {
      writer.update(ref, {
        autoResolutionTime: FieldValue.delete(),
        dpmWeights: FieldValue.delete(),
        featuredOnHomeRank: FieldValue.delete(),
        flaggedByUsernames: FieldValue.delete(),
        lowercaseTags: FieldValue.delete(),
        tags: FieldValue.delete(),
        uniqueBettors24Hours: FieldValue.delete(),
        uniqueBettors30Days: FieldValue.delete(),
        uniqueBettors7Days: FieldValue.delete(),
        volume7Days: FieldValue.delete(),
      })
    }
    await writer.close()
  })
}
