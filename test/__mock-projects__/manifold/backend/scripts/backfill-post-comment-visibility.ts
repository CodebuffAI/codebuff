// Fill all groups without privacyStatus to 'public'

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  async function backfillVisibility() {
    try {
      const postSnapshot = await firestore.collection('posts').get()
      const backfillPromises: Promise<void>[] = []

      postSnapshot.forEach((postDoc) => {
        const postVisibility = postDoc.get('visibility')
        const commentsRef = postDoc.ref.collection('comments')

        backfillPromises.push(
          backfillCommentsVisibility(commentsRef, postVisibility)
        )
      })

      await Promise.all(backfillPromises)
      console.log('Visibility backfill completed successfully.')
    } catch (error) {
      console.error('Error backfilling visibility:', error)
    }
  }

  async function backfillCommentsVisibility(
    commentsRef: FirebaseFirestore.CollectionReference,
    postVisibility: boolean
  ) {
    const commentsSnapshot = await commentsRef.get()

    const updatePromises: Promise<FirebaseFirestore.WriteResult>[] = []

    commentsSnapshot.forEach((commentDoc) => {
      const commentVisibility = commentDoc.get('visibility')

      if (commentVisibility === undefined || commentVisibility === null) {
        updatePromises.push(
          commentDoc.ref.update({ visibility: postVisibility })
        )
      }
    })

    await Promise.all(updatePromises)
  }

  backfillVisibility()
}
