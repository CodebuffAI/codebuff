import { runScript } from 'run-script'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import {
  ContractResolutionPayoutTxn,
  ContractUndoResolutionPayoutTxn,
} from 'common/txn'
import { chunk, groupBy, maxBy } from 'lodash'
import { removeUndefinedProps } from 'common/util/object'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const contractId = '1tGci7CKuli7MpdwNDmN'
    const txns = await pg.map(
      `SELECT * FROM txns WHERE data->>'category' = 'CONTRACT_RESOLUTION_PAYOUT'
                     AND data->>'fromType' = 'CONTRACT' 
                     AND data->>'fromId' = $1`,
      [contractId],
      (r) => r.data as ContractResolutionPayoutTxn
    )

    const txnsByStartTime = groupBy(txns, (txn) => txn.data.payoutStartTime)
    const maxStartTime = maxBy(Object.keys(txnsByStartTime), (key) => +key)!

    console.log('txnsByStartTime', Object.keys(txnsByStartTime))
    console.log('txns in last start time', txnsByStartTime[maxStartTime].length)

    // Revert all txns except the ones from the most recent resolve.
    const filteredTxns = txns.filter(
      (t) => t.data.payoutStartTime !== +maxStartTime
    )

    console.log('Reverting txns ' + filteredTxns.length, 'of', txns.length)

    const chunkedTxns = chunk(filteredTxns, 250)
    for (const chunk of chunkedTxns) {
      await firestore.runTransaction(async (transaction) => {
        console.log('reverting chunk of', chunk.length)
        for (const txn of chunk) {
          undoContractPayoutTxn(firestore, transaction, txn)
        }
      })
    }
    console.log('reverted txns')
  })
}

function undoContractPayoutTxn(
  firestore: admin.firestore.Firestore,
  fbTransaction: admin.firestore.Transaction,
  txnData: ContractResolutionPayoutTxn
) {
  const { amount, toId, data, fromId, id } = txnData
  const { deposit } = data ?? {}
  const toDoc = firestore.doc(`users/${toId}`)
  fbTransaction.update(toDoc, {
    balance: FieldValue.increment(-amount),
    totalDeposits: FieldValue.increment(-(deposit ?? 0)),
  })

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = {
    id: newTxnDoc.id,
    createdTime: Date.now(),
    amount: amount,
    toId: fromId,
    fromType: 'USER',
    fromId: toId,
    toType: 'CONTRACT',
    category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
    token: 'M$',
    description: `Undo contract resolution payout from contract ${fromId}`,
    data: { revertsTxnId: id },
  } as ContractUndoResolutionPayoutTxn
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return { status: 'success', data: txnData }
}
