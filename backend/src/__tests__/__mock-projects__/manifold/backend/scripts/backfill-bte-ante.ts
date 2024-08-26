import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { runScript } from './run-script'
import { FieldValue } from 'firebase-admin/firestore'

const description = `Sinclair is post-hoc accounting a contract created by BTE that is missing an ante txn
due to a bug introduced in 3cc236a8 (Feb 7) and fixed in 8d3a77b4 (Feb 8).
where when BTE did not have enough mana to create a contract, it would still create the contract and fill with liquidity but not deduct his balance.`

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    // the last non-BTE contract was created at 2024-02-08 00:18:17.118+00 or in pacific time, 2/7 4:17 PM.
    // This is right before the merge time of the commit that causes the BTE bug, 3cc236a8e6eb89391d3e9b2c9207410f82fb38d7 at 5:12 PM
    const bteQuestions = await pg.many<{ contract_id: string; amount: number }>(
      `select c.id as contract_id, (l.data->>'amount')::numeric as amount from contracts c join contract_liquidity l
      on c.id = l.contract_id
      where not exists (
        select 1 from txns
        where c.id = to_id
        and category = 'CREATE_CONTRACT_ANTE'
      )
      and (l.data->>'isAnte')::boolean = true
      and (l.data->>'answerId') is null
      -- and creator_id = '4JuXgDx47xPagH5mcLDqLzUSN5g2'
      and created_time > '2024-02-08 00:18:17.118+00'
      order by c.created_time`
    )

    if (bteQuestions.length === 0) {
      console.log('No BTE contracts found')
      return
    }
    if (bteQuestions.length > 200) {
      console.log('There shouldnt be that many')
      return
    }

    console.log('BTE contracts found:', bteQuestions.length)
    const sum = bteQuestions.reduce((acc, q) => acc + q.amount, 0)
    console.log('Total ante:', sum)

    const now = Date.now()
    const txns = bteQuestions.map((q) => ({
      category: 'CREATE_CONTRACT_ANTE',
      fromType: 'USER',
      fromId: '4JuXgDx47xPagH5mcLDqLzUSN5g2',
      toType: 'CONTRACT',
      toId: q.contract_id,
      amount: q.amount,
      token: 'M$',
      createdTime: now,
      data: {
        isBTEbackfill: true,
      },
      description: description,
    }))

    console.log('add transactions')

    const writer = new SafeBulkWriter()
    for (const txn of txns) {
      const newTxnDoc = firestore.collection(`txns/`).doc()
      writer.create(newTxnDoc, { id: newTxnDoc.id, ...txn })
    }

    await writer.close()

    console.log('deduct balance')
    await firestore.doc(`users/4JuXgDx47xPagH5mcLDqLzUSN5g2`).update({
      balance: FieldValue.increment(-sum),
      totalDeposits: FieldValue.increment(-sum),
    })

    console.log('done.')
  })
}
