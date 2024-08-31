import { BountyAddedTxn, BountyAwardedTxn, BountyCanceledTxn } from 'common/txn'
import { APIError } from 'common//api/utils'
import { runTxn } from './run-txn'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getContract, getUser } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'

export async function runAddBountyTxn(
  txnData: Omit<BountyAddedTxn, 'id' | 'createdTime'>
) {
  const { amount, toId } = txnData
  const pg = createSupabaseDirectClient()

  const contract = await getContract(pg, toId)
  if (!contract) throw new APIError(404, `Contract ${toId} not found`)
  if (contract.outcomeType !== 'BOUNTIED_QUESTION') {
    throw new APIError(
      403,
      'Invalid contract, only bountied questions are supported'
    )
  }

  const txn = await pg.tx(async (tx) => {
    const txn = await runTxn(tx, txnData)

    // update bountied contract
    await updateContract(tx, toId, {
      totalBounty: FieldVal.increment(amount),
      bountyLeft: FieldVal.increment(amount),
    })

    return txn
  })
  return txn
}

export async function runAwardBountyTxn(
  tx: SupabaseTransaction,
  txnData: Omit<BountyAwardedTxn, 'id' | 'createdTime'>
) {
  const { amount, fromId } = txnData
  const contract = await getContract(tx, fromId)
  if (!contract) throw new APIError(404, `Contract not found`)
  if (contract.outcomeType !== 'BOUNTIED_QUESTION') {
    throw new APIError(
      400,
      'Invalid contract, only bountied questions are supported'
    )
  }

  const txn = await runTxn(tx, txnData)
  const { bountyLeft } = contract
  if (bountyLeft < amount) {
    throw new APIError(
      400,
      `There is only M${bountyLeft} of bounty left to award, which is less than M${amount}`
    )
  }

  await updateContract(tx, fromId, {
    bountyLeft: FieldVal.increment(-amount),
  })

  return txn
}

export async function runCancelBountyTxn(
  txnData: Omit<BountyCanceledTxn, 'id' | 'createdTime'>,
  contractCloseTime?: number
) {
  const { fromId, toId } = txnData
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    const contract = await getContract(tx, fromId)
    if (!contract) throw new APIError(404, `Contract not found`)
    if (contract.outcomeType !== 'BOUNTIED_QUESTION') {
      throw new APIError(
        400,
        'Invalid contract, only bountied questions are supported'
      )
    }

    const user = await getUser(toId, tx)
    if (!user) throw new APIError(404, `User ${toId} not found`)

    await incrementBalance(tx, toId, {
      balance: txnData.amount,
      totalDeposits: txnData.amount,
    })

    const txn = await runTxn(tx, txnData)

    const amount = contract.bountyLeft
    if (amount != txnData.amount) {
      throw new APIError(
        500,
        'Amount changed since bounty transaction concluded. possible duplicate call'
      )
    }

    // update bountied contract
    const resolutionTime = Date.now()
    const closeTime =
      !contractCloseTime || contractCloseTime > resolutionTime
        ? resolutionTime
        : contractCloseTime

    await updateContract(tx, fromId, {
      bountyLeft: FieldVal.increment(-amount),
      closeTime,
      isResolved: true,
      resolutionTime,
      resolverId: txn.toId,
      lastUpdatedTime: resolutionTime,
    })

    return txn
  })
}
