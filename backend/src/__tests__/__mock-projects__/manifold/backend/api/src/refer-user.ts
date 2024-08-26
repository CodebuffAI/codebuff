import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { isVerified, MINUTES_ALLOWED_TO_REFER } from 'common/user'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { REFERRAL_AMOUNT } from 'common/economy'
import { createReferralNotification } from 'shared/create-notification'
import { completeReferralsQuest } from 'shared/complete-quest-internal'
import { convertUser } from 'common/supabase/users'
import { first } from 'lodash'
import { log, getContractSupabase, getUser } from 'shared/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { MINUTE_MS } from 'common/util/time'
import { removeUndefinedProps } from 'common/util/object'
import { trackPublicEvent } from 'shared/analytics'
import { convertTxn } from 'common/supabase/txns'
import { updateUser } from 'shared/supabase/users'

const bodySchema = z
  .object({
    referredByUsername: z.string(),
    contractId: z.string().optional(),
  })
  .strict()

export const referuser = authEndpoint(async (req, auth) => {
  const { referredByUsername, contractId } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  const referredByUser = first(
    await pg.map(
      `select * from users where username = $1`,
      [referredByUsername],
      (row) => convertUser(row)
    )
  )
  if (!referredByUser) {
    throw new APIError(404, `User ${referredByUsername} not found`)
  }
  if (referredByUser.isBannedFromPosting) {
    throw new APIError(
      404,
      `User ${referredByUsername} is banned from posting, not eligible for referral bonus`
    )
  }
  const newUser = await getUser(auth.uid)
  if (!newUser) {
    throw new APIError(401, `User ${auth.uid} not found`)
  }
  if (!isVerified(newUser)) {
    throw new APIError(403, 'You must verify your phone number first.')
  }
  let referredByContract: Contract | undefined
  if (contractId) {
    referredByContract = await getContractSupabase(contractId)
    if (!referredByContract) {
      throw new APIError(404, `Contract ${contractId} not found`)
    }
    log(`referredByContract: ${referredByContract.slug}`)
  }
  await handleReferral(newUser.id, referredByUser.id, referredByContract)
  await trackPublicEvent(newUser.id, 'Referral', {
    referredByUserId: referredByUser.id,
    referredByContractId: contractId,
  })

  return { status: 'ok' }
})

async function handleReferral(
  newUserId: string,
  referredByUserId: string,
  referredByContract?: Contract
) {
  const pg = createSupabaseDirectClient()
  log(`referredByUserId: ${referredByUserId}`)
  const { txn, user } = await pg.tx(async (tx) => {
    const user = await getUser(newUserId, tx)
    if (!user) throw new APIError(500, `User ${newUserId} not found`)

    if (user.referredByUserId || user.referredByContractId) {
      throw new APIError(400, `User ${user.id} already has referral details`)
    }
    if (user.createdTime < Date.now() - MINUTES_ALLOWED_TO_REFER * MINUTE_MS) {
      throw new APIError(400, `User ${user.id} is too old to be referred`)
    }

    const txns = await tx.map(
      `select * from txns where to_id = $1 and category = 'REFERRAL'`,
      [referredByUserId],
      convertTxn
    )

    // If the referring user already has a referral txn due to referring this user, halt
    // TODO: store in data instead
    if (txns.some((txn) => txn.description?.includes(user.id))) {
      throw new APIError(
        404,
        'Existing referral bonus found with matching details'
      )
    }
    log('creating referral txns')

    // if they're updating their referredId, create a txn for both
    const txnData = {
      fromType: 'BANK',
      toId: referredByUserId,
      toType: 'USER',
      amount: REFERRAL_AMOUNT,
      token: 'SPICE',
      category: 'REFERRAL',
      description: `Referred new user id: ${user.id} for ${REFERRAL_AMOUNT}`,
    } as const

    const txn = await runTxnFromBank(tx, txnData)

    await updateUser(
      tx,
      newUserId,
      removeUndefinedProps({
        referredByUserId,
        referredByContractId: referredByContract?.id,
      })
    )

    return { txn, user }
  })

  await createReferralNotification(
    referredByUserId,
    user,
    txn.amount.toString(),
    referredByContract
  )
  await completeReferralsQuest(referredByUserId)
}
