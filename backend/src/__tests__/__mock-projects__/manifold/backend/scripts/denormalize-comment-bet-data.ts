// Filling in the bet-based fields on comments.

import * as admin from 'firebase-admin'
import { zip } from 'lodash'
import { initAdmin } from 'shared/init-admin'
import { findDiffs, describeDiff, applyDiff } from './denormalize'
import { log } from 'shared/utils'
import { Transaction } from 'firebase-admin/firestore'

initAdmin()
const firestore = admin.firestore()

async function getBetComments(transaction: Transaction) {
  const allComments = await transaction.get(
    firestore.collectionGroup('comments')
  )
  const betComments = allComments.docs.filter((d) => d.get('betId'))
  log(`Found ${betComments.length} comments associated with bets.`)
  return betComments
}

async function denormalize() {
  let hasMore = true
  while (hasMore) {
    hasMore = await admin.firestore().runTransaction(async (trans) => {
      const betComments = await getBetComments(trans)
      const bets = await Promise.all(
        betComments.map((doc) =>
          trans.get(
            firestore
              .collection('contracts')
              .doc(doc.get('contractId'))
              .collection('bets')
              .doc(doc.get('betId'))
          )
        )
      )
      log(`Found ${bets.length} bets associated with comments.`)

      // dev DB has some invalid bet IDs
      const mapping = zip(bets, betComments)
        .filter(([bet, _]) => bet!.exists) // eslint-disable-line
        .map(([bet, comment]) => {
          return [bet!, [comment!]] as const // eslint-disable-line
        })

      const diffs = findDiffs(
        mapping,
        ['amount', 'betAmount'],
        ['outcome', 'betOutcome']
      )
      log(`Found ${diffs.length} comments with mismatched data.`)
      diffs.slice(0, 500).forEach((d) => {
        log(describeDiff(d))
        applyDiff(trans, d)
      })
      if (diffs.length > 500) {
        console.log(`Applying first 500 because of Firestore limit...`)
      }
      return diffs.length > 500
    })
  }
}

if (require.main === module) {
  denormalize().catch((e) => console.error(e))
}
