import { Answer } from 'common/answer'
import { groupBy, mapValues, sortBy } from 'lodash'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const answersSnap = await firestore.collectionGroup('answersCpmm').get()

    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    const answersWithoutIndex = answers.filter((a) => a.index == undefined)
    const answersByContractId = mapValues(
      groupBy(answersWithoutIndex, 'contractId'),
      (answers) => sortBy(sortBy(answers, 'createdTime'), 'prob').reverse()
    )

    for (const answers of Object.values(answersByContractId)) {
      for (const [index, answer] of answers.entries()) {
        console.log('update answer', answer.id, answer.prob, index)
        await firestore
          .doc(`contracts/${answer.contractId}/answersCpmm/${answer.id}`)
          .update({ index })
      }
    }
  })
}
