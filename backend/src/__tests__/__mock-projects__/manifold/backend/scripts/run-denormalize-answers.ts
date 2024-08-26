import { runScript } from 'run-script'
import { uniq, sortBy, chunk } from 'lodash'
import { getAnswersForContracts } from 'common/supabase/contracts'
import { HOUR_MS } from 'common/util/time'

runScript(async ({ db, firestore }) => {
  // Fetch answers modified in the last minute (plus 5 seconds)
  const oneMinuteAgo = new Date(Date.now() - 10 * HOUR_MS)
  const { data: recentAnswers } = await db
    .from('answers')
    .select('contract_id')
    .gt('fs_updated_time', oneMinuteAgo.toISOString())

  if (!recentAnswers || recentAnswers.length === 0) {
    console.log('No recently updated answers')
    return
  }

  const contractIds = uniq(
    recentAnswers.map((answer) => answer.contract_id as string)
  )

  console.log('Denormalizing answers for contracts: ', contractIds)

  const contractIdChunks = chunk(contractIds, 20)

  for (const contractIdChunk of contractIdChunks) {
    const answersByContractId = await getAnswersForContracts(
      db,
      contractIdChunk
    )
    console.log('Got answers for chunk', contractIdChunk)
    await Promise.all(
      Object.entries(answersByContractId).map(([contractId, answers]) => {
        const sortedAnswers = sortBy(answers, (answer) => answer.index)
        return firestore.collection('contracts').doc(contractId).update({
          answers: sortedAnswers,
        })
      })
    )
  }
  console.log('Done.')
})
