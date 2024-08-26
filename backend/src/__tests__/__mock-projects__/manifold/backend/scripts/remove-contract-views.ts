import { FieldValue } from 'firebase-admin/firestore'
import { runScript } from './run-script'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const writer = new SafeBulkWriter()
    const refs = await firestore.collection('contracts').listDocuments()
    console.log(`Updating ${refs.length} contracts.`)
    for (const ref of refs) {
      writer.update(ref, { views: FieldValue.delete() })
    }
    await writer.close()
  })
}
