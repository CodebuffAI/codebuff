import { Answer } from 'common/answer'
import { getMultiCpmmLiquidity } from 'common/calculate-cpmm'
import { chunk } from 'lodash'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const answersSnap = await firestore.collectionGroup('answersCpmm').get()

    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    const chunkedAnswers = chunk(answers, 10)

    for (const answers of chunkedAnswers) {
      await Promise.all(
        answers.map((answer) => {
          const totalLiquidity = getMultiCpmmLiquidity({
            YES: answer.poolYes,
            NO: answer.poolNo,
          })
          console.log(
            'update answer',
            answer.id,
            answer.poolYes,
            answer.poolNo,
            totalLiquidity
          )
          return firestore
            .doc(`contracts/${answer.contractId}/answersCpmm/${answer.id}`)
            .update({ totalLiquidity, subsidyPool: 0 })
        })
      )
    }
  })
}
