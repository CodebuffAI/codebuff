import { FieldValue } from 'firebase-admin/firestore'
import { runScript } from './run-script'
import { getTieredAnswerCost } from 'common/economy'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const createdAnswers = await pg.manyOrNone(`
      select answers.* from answers
      join contracts on answers.contract_id = contracts.id
      where answers.created_time > (contracts.created_time + interval '5 seconds')
    `)

    console.log('createdAnswers', createdAnswers)

    const answerCost = getTieredAnswerCost(undefined)
    for (const answer of createdAnswers) {
      console.log(
        'decrease deposits for user',
        answer.user_id,
        'by',
        answerCost
      )
      await firestore
        .collection('users')
        .doc(answer.user_id)
        .update({
          totalDeposits: FieldValue.increment(-answerCost),
        })
    }
  })
}
