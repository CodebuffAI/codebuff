import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_DEV) {
  throw new Error(
    'Environment variable GOOGLE_APPLICATION_CREDENTIALS_DEV is not set'
  )
}

initAdmin()

const firestore = admin.firestore()

async function processGroup(creatorId: string) {
  const contractsRef = firestore.collection('contracts')
  const query = contractsRef
    .where('creatorId', '==', creatorId)
    .where('visibility', '==', 'unlisted')
  const querySnapshot = await query.get()

  const writer = new SafeBulkWriter()

  querySnapshot.forEach((contractDoc) => {
    console.log(`Updating contract with ID: ${contractDoc.id}`)
    writer.update(contractDoc.ref, { visibility: 'public' })
  })

  await writer.close()
}

if (require.main === module) {
  const creatorId = process.argv[2]
  if (!creatorId) {
    console.error('Please provide a creatorId as an argument')
    process.exit(1)
  }
  processGroup(creatorId)
}
