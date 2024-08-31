// Comment types were introduced in August 2022.

import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

if (require.main === module) {
  const app = initAdmin()
  const firestore = app.firestore()
  const commentsRef = firestore.collectionGroup('comments')
  commentsRef.get().then(async (commentsSnaps) => {
    log(`Loaded ${commentsSnaps.size} comments.`)
    const needsFilling = commentsSnaps.docs.filter((ct) => {
      return !('commentType' in ct.data())
    })
    log(`Found ${needsFilling.length} comments to update.`)
    const updates = needsFilling.map((d) => {
      const comment = d.data()
      const fields: { [k: string]: unknown } = {}
      if (comment.contractId != null && comment.groupId == null) {
        fields.commentType = 'contract'
      } else if (comment.groupId != null && comment.contractId == null) {
        fields.commentType = 'group'
      } else {
        log(`Invalid comment ${comment}; not touching it.`)
      }
      return { doc: d.ref, fields, info: comment }
    })
    await writeAsync(firestore, updates)
    log(`Updated all comments.`)
  })
}
