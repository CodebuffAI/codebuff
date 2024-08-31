import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { noFees } from 'common/fees'
import { CandidateBet } from 'common/new-bet'
import { floatingEqual } from 'common/util/math'
import { groupBy, sumBy } from 'lodash'
import { runScript } from 'run-script'
import { bulkInsertBets } from 'shared/supabase/bets'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const answersAdded = await pg.map<Answer>(
      `select a.data from answers a
      join contracts c on a.contract_id = c.id
      where
        a.created_time > now() - interval '5 day' - interval '3 hour'
        and c.created_time + interval '1 minute' < a.created_time
        and c.data->>'shouldAnswersSumToOne' = 'true'
      `,
      [],
      (r) => r.data
    )

    console.log(answersAdded, answersAdded.length)

    const betsToInsert: (CandidateBet & {
      userId: string
    })[] = []

    for (const answer of answersAdded) {
      console.log(answer)
      const allAnswers = await pg.map<Answer>(
        `select data from answers
        where contract_id = $1
        `,
        [answer.contractId],
        (r) => r.data
      )
      console.log('all answers', allAnswers.length)
      const otherAnswer = allAnswers.find((a) => a.isOther)
      if (!otherAnswer) {
        throw new Error('No other answer found')
      }

      const bets = await pg.map<Bet>(
        `select data from contract_bets
        where contract_id = $1
        and created_time < millis_to_ts($2)
        order by created_time
        `,
        [answer.contractId, answer.createdTime],
        (r) => r.data
      )

      const originalAnswerProb = await pg.one(
        `select prob_before from contract_bets
        where contract_id = $1
        and answer_id = $2
        order by created_time
        limit 1
        `,
        [answer.contractId, answer.id],
        (r) => Number(r.prob_before)
      )
      console.log('originalAnswerProb', originalAnswerProb)

      const betsByUser = groupBy(bets, 'userId')

      for (const [userId, bets] of Object.entries(betsByUser)) {
        const otherShares = sumBy(
          bets.filter((b) => b.answerId === otherAnswer.id),
          (b) => (b.outcome === 'YES' ? b.shares : -b.shares)
        )
        if (floatingEqual(otherShares, 0)) continue

        if (otherShares > 0) {
          console.log('userId', userId, bets.length, otherShares)
          const freeYesSharesBet: CandidateBet & {
            userId: string
          } = {
            contractId: answer.contractId,
            userId,
            answerId: answer.id,
            outcome: 'YES',
            shares: otherShares,
            amount: 0,
            isCancelled: false,
            isFilled: true,
            loanAmount: 0,
            probBefore: originalAnswerProb,
            probAfter: originalAnswerProb,
            createdTime: answer.createdTime,
            fees: noFees,
            isAnte: false,
            isRedemption: true,
            visibility: bets[0].visibility,
            isApi: false,
          }
          betsToInsert.push(freeYesSharesBet)
        }
      }
    }
    console.log(betsToInsert, betsToInsert.length)
    await bulkInsertBets(betsToInsert, pg)
  })
}
