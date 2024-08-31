import { type APIHandler } from './helpers/endpoint'
import { charities } from 'common/charity'
import { APIError } from 'api/helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CHARITY_FEE, MIN_SPICE_DONATION } from 'common/envs/constants'
import { getUser } from 'shared/utils'

export const donate: APIHandler<'donate'> = async ({ amount, to }, auth) => {
  const charity = charities.find((c) => c.id === to)
  if (!charity) throw new APIError(404, 'Charity not found')

  const pg = createSupabaseDirectClient()

  await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    if (user.spiceBalance < amount) {
      throw new APIError(403, 'Insufficient prize points')
    }

    if (amount < MIN_SPICE_DONATION) {
      throw new APIError(400, 'Minimum donation is 25,000 prize points')
    }

    // add donation to charity
    const fee = CHARITY_FEE * amount
    const donation = amount - fee

    const feeTxn = {
      category: 'CHARITY_FEE',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: fee,
      token: 'SPICE',
      data: {
        charityId: charity.id,
      },
    } as const

    const donationTxn = {
      category: 'CHARITY',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'CHARITY',
      toId: charity.id,
      amount: donation,
      token: 'SPICE',
    } as const

    await runTxn(tx, feeTxn)
    await runTxn(tx, donationTxn)
  })
}
