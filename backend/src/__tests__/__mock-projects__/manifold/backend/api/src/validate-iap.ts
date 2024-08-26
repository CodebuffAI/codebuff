import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { z } from 'zod'
import { getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { trackPublicEvent } from 'shared/analytics'
import * as admin from 'firebase-admin'
import { IapTransaction, PurchaseData } from 'common/iap'
import { ManaPurchaseTxn } from 'common/txn'
import { sendThankYouEmail } from 'shared/emails'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z
  .object({
    receipt: z.string(),
  })
  .strict()

const PRODUCTS_TO_AMOUNTS: { [key: string]: number } = {
  mana_1000: 10000, // note: SKUs created before rate change
  mana_2500: 25000,
  mana_10000: 100000,
}

const IAP_TYPES_PROCESSED = 'apple'

export const validateiap = authEndpoint(async (req, auth) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const iap = require('@flat/in-app-purchase')
  const { receipt } = validate(bodySchema, req.body)
  const userId = auth.uid

  iap.config({
    test: !isProd(), // For Apple and Google Play to force Sandbox validation only
    verbose: true, // Output debug logs to stdout stream
  })
  await iap.setup().catch((error: any) => {
    log('Error setting up iap', error)
    throw new APIError(500, 'iap setup failed')
  })

  const validatedData = await iap.validate(receipt).catch((error: any) => {
    log('error on validate data:', error)
    throw new APIError(500, 'iap receipt validation failed')
  })

  // TODO uncomment this after app is accepted by Apple.
  log('validated data, sandbox:', validatedData.sandbox)
  // if (isProd() && validatedData.sandbox) {
  // Apple wants a successful response even if the receipt is from the sandbox,
  // so we just return success here and don't transfer any mana.
  // return { success: true }
  // }

  const options = {
    ignoreCanceled: true, // Apple ONLY (for now...): purchaseData will NOT contain canceled items
    ignoreExpired: true, // purchaseData will NOT contain expired subscription items
  }
  // validatedData contains sandbox: true/false for Apple and Amazon
  const purchaseData = iap.getPurchaseData(
    validatedData,
    options
  ) as PurchaseData[]
  log('purchase data:', purchaseData)

  const { transactionId, productId, purchaseDateMs, quantity } = purchaseData[0]

  const query = await firestore
    .collection('iaps')
    .where('transactionId', '==', transactionId)
    .get()

  if (!query.empty) {
    log('transactionId', transactionId, 'already processed')
    throw new APIError(403, 'iap transaction already processed')
  }

  const payout = PRODUCTS_TO_AMOUNTS[productId] * quantity
  const revenue = (payout / 1000) * 0.2 + payout / 1000 - 0.01

  log('payout', payout)
  const iapTransRef = firestore.collection('iaps').doc()
  const iapTransaction: IapTransaction = {
    userId,
    manaQuantity: payout, // save as number
    createdTime: Date.now(),
    purchaseTime: purchaseDateMs,
    transactionId,
    quantity,
    receipt,
    productId,
    type: IAP_TYPES_PROCESSED,
    revenue,
    id: iapTransRef.id,
  }
  log('iap transaction:', iapTransaction)
  await firestore.collection('iaps').doc(iapTransRef.id).set(iapTransaction)

  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: payout,
    token: 'M$',
    category: 'MANA_PURCHASE',
    data: {
      iapTransactionId: iapTransRef.id,
      type: IAP_TYPES_PROCESSED,
    },
    description: `Deposit M$${payout} from BANK for mana purchase`,
  } as Omit<ManaPurchaseTxn, 'id' | 'createdTime'>

  const pg = createSupabaseDirectClient()
  await pg.tx(async (tx) => runTxnFromBank(tx, manaPurchaseTxn))

  log('user', userId, 'paid M$', payout)

  const user = await getUser(userId)
  if (!user) throw new APIError(500, 'Your account was not found')

  const privateUser = await getPrivateUser(userId)
  if (!privateUser) throw new APIError(500, 'Private user not found')

  await sendThankYouEmail(user, privateUser)
  log('iap revenue', revenue)
  await trackPublicEvent(
    userId,
    'M$ purchase',
    { amount: payout, transactionId },
    { revenue }
  )
  return { success: true }
})

const firestore = admin.firestore()
