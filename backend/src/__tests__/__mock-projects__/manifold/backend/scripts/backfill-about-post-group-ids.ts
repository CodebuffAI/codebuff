// Fill all groups without privacyStatus to 'public'

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  async function updatePostsWithGroupIdAndVisibility(): Promise<void> {
    try {
      // Get all groups with 'aboutPostId' field
      const groupSnapshot = await firestore
        .collection('groups')
        .where('aboutPostId', '!=', null)
        .get()

      if (groupSnapshot.empty) {
        console.log('No groups with aboutPostId found.')
        return
      }

      const updatePostPromises: Promise<any>[] = []

      // Iterate over groups and find corresponding posts
      groupSnapshot.forEach((groupDoc) => {
        const groupData = groupDoc.data()
        const groupId = groupDoc.id
        const aboutPostId = groupData.aboutPostId
        const visibility =
          groupData.privacyStatus != 'private' ? 'public' : 'private'

        console.log(groupId, aboutPostId, visibility)
        const postRef = firestore.collection('posts').doc(aboutPostId)

        // Update 'groupId' and 'visibility' fields in the corresponding post
        updatePostPromises.push(
          postRef.get().then((postDoc) => {
            if (postDoc.exists) {
              return postRef.update({ groupId, visibility })
            } else {
              console.warn(
                `Post document with ID '${aboutPostId}' does not exist.`
              )
              return null
            }
          })
        )
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
