import { FieldValue } from 'firebase-admin/firestore'
import { runScript } from './run-script'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const writer = new SafeBulkWriter()
    const refs = await firestore.collection('users').listDocuments()
    console.log(`Updating ${refs.length} users.`)
    for (const ref of refs) {
      writer.update(ref, {
        achievements: FieldValue.delete(),
        balanceUsd: FieldValue.delete(),
        creatorVolumeCached: FieldValue.delete(),
        followedCategories: FieldValue.delete(),
        freeMarketsCreated: FieldValue.delete(),
        homeSections: FieldValue.delete(),
        profitRankCached: FieldValue.delete(),
        totalPnLCached: FieldValue.delete(),
        sharesThisWeek: FieldValue.delete(),
        topicInterests: FieldValue.delete(),
      })
    }
    await writer.close()
  })
}
