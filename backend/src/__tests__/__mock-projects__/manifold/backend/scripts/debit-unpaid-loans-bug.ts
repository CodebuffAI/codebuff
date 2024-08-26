import { CPMMMultiContract } from 'common/contract'
import { sum } from 'lodash'
import { runScript } from 'run-script'
import { getUser, payUser } from 'shared/utils'

if (module === require.main) {
  runScript(async ({ pg, firestore }) => {
    const contractsToCheck = await pg.map<CPMMMultiContract>(
      `
    SELECT *
    FROM contracts
    WHERE outcome_type = 'MULTIPLE_CHOICE'
    and data ->> 'shouldAnswersSumToOne' = 'true'
    AND resolution_time > '2023-10-25 16:41:00'::timestamptz AT TIME ZONE 'PDT'
    AND resolution_time < '2023-12-08 17:10:00'::timestamptz AT TIME ZONE 'PST';
    `,
      [],
      (r) => r.data
    )

    console.log('got contracts', contractsToCheck.length)

    const userIdToLoanTotal: Record<string, number> = {}

    for (const contract of contractsToCheck) {
      const userLoanTotals = await pg.manyOrNone<{
        user_id: string
        loan_total: number
      }>(
        `select user_id, SUM((data ->> 'loanAmount')::numeric) as loan_total
        from contract_bets
        where contract_id = $1
          and shares = 0
          and (data ->> 'loanAmount')::numeric > 0
        group by user_id
        order by loan_total desc
`,
        [contract.id]
      )

      for (const { user_id, loan_total } of userLoanTotals) {
        userIdToLoanTotal[user_id] =
          (userIdToLoanTotal[user_id] ?? 0) + loan_total
      }
    }
    console.log('got user loan totals', userIdToLoanTotal)

    for (const [user_id, loan_total] of Object.entries(userIdToLoanTotal)) {
      const user = await getUser(user_id)
      if (!user) continue

      const debit = -loan_total
      console.log('debit', user.username, user_id, debit)

      await firestore.collection('users').doc(user_id).update({
        tempLoanDebitDec8: debit,
      })
      await payUser(user_id, debit, false)
    }
  })
}
