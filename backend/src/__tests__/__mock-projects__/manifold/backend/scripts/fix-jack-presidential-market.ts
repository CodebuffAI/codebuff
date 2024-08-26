import { Answer } from 'common/answer'
import { MultiContract } from 'common/contract'
import { sumBy } from 'lodash'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const contractId = 'ikSUiiNS8MwAI75RwEJf'
    const contractSnap = await firestore
      .collection('contracts')
      .doc(contractId)
      .get()
    const contract = contractSnap.data() as MultiContract

    const answersSnap = await firestore
      .collection(`contracts/${contractId}/answersCpmm`)
      .get()
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)

    console.log('contract', contract)
    console.log('answers', answers.length)

    const trumpAnswer = answers.find((a) => a.text === 'Donald Trump')
    const workingAnswers = answers.filter((a) => a.text !== 'Donald Trump')
    console.log('trumpAnswer', trumpAnswer, workingAnswers.length)
    const trumpProb = 1 - sumBy(workingAnswers, (a) => a.prob)
    console.log('trumpProb', trumpProb)

    const bidenAnswer = answers.find((a) => a.text === 'Joe Biden')
    if (!bidenAnswer) throw new Error('No Biden answer found')
    const liquidity = Math.sqrt(bidenAnswer.poolNo * bidenAnswer.poolYes)
    // trump no / (trump no + trump yes) = trump prob
    // sqrt(trump no * trump yes) = liquidity
    const trumpYes = liquidity * Math.sqrt((1 - trumpProb) / trumpProb)
    const trumpNo = liquidity * Math.sqrt(trumpProb / (1 - trumpProb))
    console.log(
      'trumpYes',
      trumpYes,
      'trumpNo',
      trumpNo,
      'liquidity',
      liquidity,
      'biden yes',
      bidenAnswer.poolYes,
      'biden no',
      bidenAnswer.poolNo
    )
  })
}
