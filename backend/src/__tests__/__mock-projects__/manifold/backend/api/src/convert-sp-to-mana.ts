import { APIError, APIHandler } from './helpers/endpoint'
import { type TxnData, insertTxns } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'

export const convertSpiceToMana: APIHandler<'convert-sp-to-mana'> = async (
  { amount },
  auth
) => {
  const pg = createSupabaseDirectClient()

  await betsQueue.enqueueFn(async () => {
    // check if user has enough spice
    await pg.tx(async (tx) => {
      const user = await getUser(auth.uid, tx)
      if (!user) throw new APIError(401, 'Your account was not found')

      if (user.spiceBalance < amount) {
        throw new APIError(403, 'Not enough balance')
      }

      await incrementBalance(tx, auth.uid, {
        spiceBalance: -amount,
        balance: +amount,
      })
    })

    // key for equivalence
    const insertTime = Date.now()

    const toBank: TxnData = {
      category: 'CONSUME_SPICE',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: amount,
      token: 'SPICE',
      description: 'Convert prize points to mana',
      data: { insertTime },
    }

    const toYou: TxnData = {
      category: 'CONSUME_SPICE_DONE',
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: auth.uid,
      amount: amount,
      token: 'M$',
      description: 'Convert prize points to mana',
      data: {
        insertTime,
      },
    }

    await pg.tx((tx) => insertTxns(tx, [toBank, toYou]))
  }, [auth.uid])
}
