import * as admin from 'firebase-admin'
import { runScript } from './run-script'
import { Answer } from 'common/answer'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const contractId = 'gR6pJiYQVtRfxoPsZxnG'
    const answersCollection = firestore.collection(
      `contracts/${contractId}/answersCpmm`
    )

    const snapshot = await answersCollection.get()
    const batch = admin.firestore().batch()
    snapshot.forEach((doc) => {
      const data = doc.data() as Answer
      if (data.resolution === 'NO') {
        console.log('update answer', data, 'to', 0)
        batch.update(doc.ref, { resolutionProbability: 0 })
      } else if (data.resolution === 'YES') {
        console.log('update answer', data, 'to', 1)
        batch.update(doc.ref, { resolutionProbability: 1 })
      }
    })
    await batch.commit().catch((error) => {
      console.error('Error updating answers:', error)
    })

    console.log('Answers updated successfully')
  })
}
