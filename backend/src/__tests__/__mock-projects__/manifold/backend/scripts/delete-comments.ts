import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Comment } from 'common/comment'
import { richTextToString } from 'common/util/parse'

const firestore = admin.firestore()

async function deleteComments(username: string, confirmed: boolean) {
  console.log('Deleting comments from username', username)

  const snapshot = await firestore
    .collectionGroup('comments')
    .where('userUsername', '==', username)
    .get()
  const comments = snapshot.docs.map((doc) => doc.data() as Comment)

  console.log('Loaded', comments.length, 'comments')

  for (const doc of snapshot.docs) {
    const comment = doc.data()
    console.log('deleting', richTextToString(comment.content))
    if (confirmed) {
      await doc.ref.delete()
    }
  }
}

if (require.main === module) {
  const [username, confirmed] = process.argv.slice(2)
  if (!username) {
    console.log(
      'First argument must be username of account whose comments to delete'
    )
    process.exit(1)
  }
  const didConfirm = confirmed === '--confirm'
  if (!didConfirm) {
    console.log('Run with "--confirm" to actually delete comments')
  }
  deleteComments(username, didConfirm).then(() => process.exit())
}
