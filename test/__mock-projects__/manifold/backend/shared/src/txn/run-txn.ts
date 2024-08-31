import { Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'
import { bulkInsert, insert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'
import { SupabaseTransaction } from 'shared/supabase/init'
import { convertTxn } from 'common/supabase/txns'
import { removeUndefinedProps } from 'common/util/object'
import { getUser } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { buildArray } from 'common/util/array'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

export async function runTxn(
  pgTransaction: SupabaseTransaction,
  data: TxnData,
  affectsProfit = false
) {
  const { amount, fromType, fromId, toId, toType, token } = data
  const deps = buildArray(
    (fromType === 'USER' || fromType === 'CONTRACT') && fromId,
    (toType === 'USER' || toType === 'CONTRACT') && toId
  )
  return await betsQueue.enqueueFn(async () => {
    if (!isFinite(amount)) {
      throw new APIError(400, 'Invalid amount')
    }

    if (!isAdminId(fromId) && amount <= 0) {
      throw new APIError(400, 'Amount must be positive')
    }

    if (token !== 'SPICE' && token !== 'M$' && token !== 'CASH') {
      throw new APIError(400, `Invalid token type: ${token}`)
    }

    if (fromType === 'BANK' || fromType === 'CONTRACT') {
      // Do nothing
    } else if (fromType === 'USER') {
      const fromUser = await getUser(fromId, pgTransaction)

      if (!fromUser) {
        throw new APIError(404, `User ${fromId} not found`)
      }

      if (token === 'SPICE') {
        if (fromUser.spiceBalance < amount) {
          throw new APIError(
            403,
            `Insufficient points balance: ${fromUser.username} needed ${amount} but only had ${fromUser.spiceBalance}`
          )
        }
        await incrementBalance(pgTransaction, fromId, {
          spiceBalance: -amount,
          totalDeposits: -amount,
        })
      } else if (token === 'CASH') {
        if (fromUser.cashBalance < amount) {
          throw new APIError(
            403,
            `Insufficient cash balance: ${fromUser.username} needed ${amount} but only had ${fromUser.cashBalance}`
          )
        }
        await incrementBalance(pgTransaction, fromId, {
          cashBalance: -amount,
          totalCashDeposits: -amount,
        })
      } else {
        if (fromUser.balance < amount) {
          throw new APIError(
            403,
            `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.balance}`
          )
        }
        await incrementBalance(pgTransaction, fromId, {
          balance: -amount,
          totalDeposits: -amount,
        })
      }
    } else {
      throw new APIError(
        400,
        `This method does not support transfers from ${fromType}`
      )
    }

    if (toType === 'USER') {
      const toUser = await getUser(toId, pgTransaction)
      if (!toUser) {
        throw new APIError(404, `User ${toId} not found`)
      }

      const update: {
        balance?: number
        cashBalance?: number
        spiceBalance?: number
        totalDeposits?: number
      } = {}

      if (token === 'SPICE') {
        update.spiceBalance = amount
      } else if (token === 'CASH') {
        update.cashBalance = amount
      } else {
        update.balance = amount
      }

      if (!affectsProfit) {
        update.totalDeposits = amount
      }

      await incrementBalance(pgTransaction, toId, update)
    } else if (
      toType === 'CHARITY' ||
      toType === 'BANK' ||
      toType === 'CONTRACT' ||
      toType === 'AD'
    ) {
      // do nothing
    } else {
      throw new APIError(
        400,
        `This method does not support transfers to ${toType}`
      )
    }

    const txn = await insertTxn(pgTransaction, data)
    return txn
  }, deps)
}

export async function runTxnFromBank(
  pgTransaction: SupabaseTransaction,
  data: Omit<TxnData, 'fromId'> & { fromType: 'BANK' },
  affectsProfit = false
) {
  return await runTxn(pgTransaction, { fromId: 'BANK', ...data }, affectsProfit)
}

// inserts into supabase
export async function insertTxn(
  pgTransaction: SupabaseTransaction,
  txn: TxnData
) {
  const row = await insert(pgTransaction, 'txns', txnDataToRow(txn))
  return convertTxn(row)
}

// bulk insert into supabase
export async function insertTxns(
  pgTransaction: SupabaseTransaction,
  txns: TxnData[]
) {
  await bulkInsert(pgTransaction, 'txns', txns.map(txnDataToRow))
}

const txnDataToRow = (data: TxnData) => {
  return {
    data: JSON.stringify(
      // data is nested an extra level for legacy reasons
      removeUndefinedProps({ data: data.data, description: data.description })
    ),
    amount: data.amount,
    token: data.token,
    from_id: data.fromId,
    to_id: data.toId,
    from_type: data.fromType,
    to_type: data.toType,
    category: data.category,
  } as const
}
