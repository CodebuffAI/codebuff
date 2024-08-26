import { initAdmin } from 'shared/init-admin'
initAdmin()
import * as admin from 'firebase-admin'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { handleCommentNotifications } from 'functions/triggers/on-create-comment-on-contract'
import * as crypto from 'crypto'
const firestore = admin.firestore()

const notifyOfComments = async () => {
  // get comments made starting from 8pm april 17th
  const commentSnap = await firestore
    .collectionGroup('comments')
    .where('createdTime', '>', 1681783200000)
    .orderBy('createdTime', 'desc')
    .get()
  const comments = commentSnap.docs.map((doc) => doc.data() as Comment)
  console.log('comments before filtering', comments.length)
  let count = 0
  await Promise.all(
    comments.map(async (comment) => {
      if (comment.commentType !== 'contract') return
      if (comment.betId || comment.createdTime > 1681999200000) return
      const contract = (
        await firestore.collection('contracts').doc(comment.contractId).get()
      ).data() as Contract
      const commentCreator = (
        await firestore.collection(`users`).doc(comment.userId).get()
      ).data() as User
      await handleCommentNotifications(
        comment,
        contract,
        commentCreator,
        undefined,
        'fix-comment-notif-' + crypto.randomUUID()
      )
      count++
      console.log('notifs sent', count)
    })
  )
}

if (require.main === module) {
  notifyOfComments()
    .then(() => process.exit())
    .catch(console.log)
}
