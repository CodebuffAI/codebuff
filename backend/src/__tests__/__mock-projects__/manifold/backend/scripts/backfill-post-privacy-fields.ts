// Fill all groups without privacyStatus to 'public'

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const db = admin.firestore()

if (require.main === module) {
  async function addVisibilityToPostsWithoutVisibilityField(): Promise<void> {
    try {
      // Get all posts
      const postSnapshot = await db.collection('posts').get()

      if (postSnapshot.empty) {
        console.log('No posts found.')
        return
      }

      const updatePostPromises: Promise<any>[] = []

      // Iterate over posts and add 'visibility': 'public' if the 'visibility' field is missing
      postSnapshot.forEach((postDoc) => {
        const postData = postDoc.data()

        if (!postData.hasOwnProperty('visibility')) {
          const postId = postDoc.id
          const postRef = db.collection('posts').doc(postId)
          console.log(postId)

          // Add 'visibility': 'public' to the post
          updatePostPromises.push(postRef.update({ visibility: 'public' }))
        }
      })

      // Wait for all post updates to complete
      await Promise.all(updatePostPromises)

      console.log('Added visibility field to all posts without visibility.')
    } catch (error) {
      console.error('Error adding visibility field to posts:', error)
    }
  }

  addVisibilityToPostsWithoutVisibilityField()
}
