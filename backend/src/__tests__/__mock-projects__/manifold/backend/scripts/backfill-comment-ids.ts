// We have some old comments without IDs and user IDs. Let's fill them in.
// Luckily, this was back when all comments had associated bets, so it's possible
// to retrieve the user IDs through the bets.

import * as admin from 'firebase-admin'
import { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'
import { Bet } from 'common/bet'

initAdmin()
const firestore = admin.firestore()

const getUserIdsByCommentId = async (comments: QueryDocumentSnapshot[]) => {
  const bets = await firestore.collectionGroup('bets').get()
  log(`Loaded ${bets.size} bets.`)
  const betsById = Object.fromEntries(
    bets.docs.map((b) => [b.id, b.data() as Bet])
  )
  return Object.fromEntries(
    comments.map((c) => [c.id, betsById[c.data().betId].userId])
  )
}

if (require.main === module) {
  const commentsQuery = firestore.collectionGroup('comments')
  commentsQuery.get().then(async (commentSnaps) => {
    log(`Loaded ${commentSnaps.size} comments.`)
    const needsFilling = commentSnaps.docs.filter((ct) => {
      return !('id' in ct.data()) || !('userId' in ct.data())
    })
    log(`${needsFilling.length} comments need IDs.`)
    const userIdNeedsFilling = needsFilling.filter((ct) => {
      return !('userId' in ct.data())
    })
    log(`${userIdNeedsFilling.length} comments need user IDs.`)
    const userIdsByCommentId =
      userIdNeedsFilling.length > 0
        ? await getUserIdsByCommentId(userIdNeedsFilling)
        : {}
    const updates = needsFilling.map((ct) => {
      const fields: { [k: string]: unknown } = {}
      if (!ct.data().id) {
        fields.id = ct.id
      }
      if (!ct.data().userId && userIdsByCommentId[ct.id]) {
        fields.userId = userIdsByCommentId[ct.id]
      }
      return { doc: ct.ref, fields }
    })
    log(`Updating ${updates.length} comments.`)
    await writeAsync(firestore, updates)
    log(`Updated all comments.`)
  })
}
