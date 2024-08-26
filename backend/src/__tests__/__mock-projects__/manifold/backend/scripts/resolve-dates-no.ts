import { runScript } from 'run-script'
import { Answer } from 'common/answer'
import { CPMMMultiContract } from 'common/contract'
import { manifoldLoveUserId } from 'common/love/constants'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const contracts = await pg.map<CPMMMultiContract>(
      `
    select data
    from contracts
    where data ->> 'loverUserId1' is not null
      and outcome_type = 'MULTIPLE_CHOICE'
      and resolution is null
      and (data -> 'answers' -> 0 ->> 'text') LIKE '%Dec 11%'
      and (data -> 'answers' -> 0 ->> 'resolution') is null
  `,
      [],
      (r) => r.data
    )

    console.log(contracts.length, 'contracts to resolve')

    const manifoldLoveUser = await getUser(manifoldLoveUserId)
    if (!manifoldLoveUser) throw new Error('Manifold Love user not found')

    for (const contract of contracts) {
      let lastResolution = 'YES'
      for (const answerId of contract.answers.map((a) => a.id)) {
        // Fetch latest answers.
        const answersSnap = await firestore
          .collection(`contracts/${contract.id}/answersCpmm`)
          .get()
        const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
        contract.answers = answers

        const answer = answers.find((a) => a.id === answerId)

        if (!answer) throw new Error('Answer not found')
        if (answer.resolution) {
          lastResolution = answer.resolution
          continue
        }

        const outcome = lastResolution === 'YES' ? 'NO' : 'CANCEL'
        console.log('Resolving ' + answer.text + ' to ' + outcome)

        await resolveMarketHelper(
          contract,
          manifoldLoveUser,
          manifoldLoveUser,
          {
            answerId: answer.id,
            outcome,
          }
        )

        lastResolution = outcome
      }
      console.log('Resolved contract', contract.question)
    }
  })
}
