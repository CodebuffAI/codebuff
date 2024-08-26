import { runScript } from './run-script'
import { LoanTxn } from 'common/txn'
import { FieldValue } from 'firebase-admin/firestore'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const loanTxns = await pg.map(
      `
      select * from txns where data->>'category' = 'LOAN'
                   and data->'data' is null
             `,
      [],
      (r) => r.data as LoanTxn
    )
    console.log(`Found ${loanTxns.length} loan txns`)
    console.log('Example txn:', loanTxns[0])
    let count = 0
    await Promise.all(
      loanTxns.map(async (loanTxn) => {
        await firestore
          .collection('users')
          .doc(loanTxn.toId)
          .update({
            totalDeposits: FieldValue.increment(-loanTxn.amount),
          })
        count++
        console.log(`Updated ${loanTxn.toId} ${count}/${loanTxns.length}`)
      })
    )
  })
}
