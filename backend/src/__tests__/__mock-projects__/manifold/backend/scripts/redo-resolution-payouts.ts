import { Contract } from 'common/contract'
import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
initAdmin()
import {
  getDataAndPayoutInfo,
  payUsersTransactions,
} from 'shared/resolve-market-helpers'
const firestore = admin.firestore()

const CONTRACT_ID = 'tWQ6DLrSaFQ8ifC1GIOj'
const OUTCOME = 'YES'
const redoResolutionPayouts = async (
  contractId: string,
  outcome: 'YES' | 'NO'
) => {
  const contract = (
    await firestore.doc(`contracts/${contractId}`).get()
  ).data() as Contract
  if (!contract) {
    throw new Error(`Contract not found: ${contractId}`)
  }
  if (contract.outcomeType !== 'BINARY') {
    throw new Error(`Contract is not binary: ${contractId}`)
  }
  const { payouts } = await getDataAndPayoutInfo(
    outcome,
    contract,
    undefined,
    undefined,
    undefined
  )
  await payUsersTransactions(payouts, contract.id)
}
if (require.main === module)
  redoResolutionPayouts(CONTRACT_ID, OUTCOME).then(() => process.exit())
