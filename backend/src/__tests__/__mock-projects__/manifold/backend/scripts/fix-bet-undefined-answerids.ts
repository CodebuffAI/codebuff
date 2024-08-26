import { runScript } from './run-script'
import { FieldValue } from 'firebase-admin/firestore'
import { Bet } from 'common/bet'
import { log } from 'shared/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

runScript(async ({ firestore }) => {
  const writer = new SafeBulkWriter({ throttling: false })
  let updated = 0
  const limitBets = firestore
    .collectionGroup('bets')
    .where('answerId', '==', 'undefined')
    .orderBy('id', 'asc')
    .limit(100000)
  const limitBetsSnap = await limitBets.get()
  const limitBetsDocs = limitBetsSnap.docs
  console.log(`Found ${limitBetsDocs.length} bets with 'undefined' answerIds`)
  for (const doc of limitBetsDocs) {
    const data = doc.data() as Bet
    if (data.answerId !== 'undefined') continue
    const update = { answerId: FieldValue.delete() }
    updated++
    writer.update(doc.ref, update)
  }

  log(`Committing ${updated} updates...`)
  await writer.close()
  return updated
})
