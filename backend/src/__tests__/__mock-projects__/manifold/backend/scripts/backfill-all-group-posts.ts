// Fill all groups without privacyStatus to 'public'

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const db = admin.firestore()

if (require.main === module) {
  async function updatePostsWithGroupIdAndVisibility(): Promise<void> {
    try {
      // Get all groups with 'postIds' field
      const groupSnapshot = await db
        .collection('groups')
        .where('postIds', '!=', null)
        .get()

      if (groupSnapshot.empty) {
        console.log('No groups with postIds found.')
        return
      }

      const updatePostPromises: Promise<any>[] = []

      // Iterate over groups and find corresponding posts
      groupSnapshot.forEach((groupDoc) => {
        const groupData = groupDoc.data()
        const groupId = groupDoc.id
        const postIds = groupData.postIds
        const visibility = groupData.privacyStatus

        // Iterate over postIds and update corresponding posts
        postIds.forEach((postId: string) => {
          const postRef = db.collection('posts').doc(postId)

          // Check if the post exists before updating
          updatePostPromises.push(
            postRef.get().then((postDoc) => {
              if (postDoc.exists) {
                return postRef.update({ groupId, visibility })
              } else {
                console.warn(
                  `Post document with ID '${postId}' does not exist.`
                )
                return null
              }
            })
          )
        })
      })

      // Wait for all post updates to complete
      await Promise.all(updatePostPromises)

      console.log('Updated all posts with groupId and visibility.')
    } catch (error) {
      console.error('Error updating posts:', error)
    }
  }

  updatePostsWithGroupIdAndVisibility()
}
