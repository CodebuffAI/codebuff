// Filling in the user-based fields on bets.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { findDiffs, describeDiff, getDiffUpdate } from './denormalize'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

// not in a transaction for speed -- may need to be run more than once
async function denormalize() {
  const users = await firestore.collection('users').get()
  log(`Found ${users.size} users.`)
  for (const userDoc of users.docs) {
    const userBets = await firestore
      .collectionGroup('bets')
      .where('userId', '==', userDoc.id)
      .get()
    const mapping = [[userDoc, userBets.docs] as const] as const
    const diffs = findDiffs(
      mapping,
      ['avatarUrl', 'userAvatarUrl'],
      ['name', 'userName'],
      ['username', 'userUsername']
    )
    log(`Found ${diffs.length} bets with mismatched user data.`)
    const updates = diffs.map((d) => {
      log(describeDiff(d))
      return getDiffUpdate(d)
    })
    await writeAsync(firestore, updates)
  }
}

if (require.main === module) {
  denormalize().catch((e) => console.error(e))
}
