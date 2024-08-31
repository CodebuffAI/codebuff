import * as admin from 'firebase-admin'
import Stripe from 'stripe'
import { Request, Response } from 'express'

import { getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { sendThankYouEmail } from 'shared/emails'
import { trackPublicEvent } from 'shared/analytics'
import { APIError } from 'common/api/utils'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'

export type StripeSession = Stripe.Event.Data.Object & {
  id: string
  metadata: {
    userId: string
    manticDollarQuantity: string
  }
}

export type StripeTransaction = {
  userId: string
  manticDollarQuantity: number
  sessionId: string
  session: StripeSession
  timestamp: number
}

const initStripe = () => {
  const apiKey = process.env.STRIPE_APIKEY as string
  return new Stripe(apiKey, { apiVersion: '2020-08-27', typescript: true })
}

// manage at https://dashboard.stripe.com/test/products?active=true
const manticDollarStripePrice = isProd()
  ? {
      1399: 'price_1P5bG1GdoFKoCJW7aoWlFYL2',
      2999: 'price_1P5bIQGdoFKoCJW7MXrOwn7l',
      10999: 'price_1P5bJ2GdoFKoCJW7YBXcxaEx',
      100000: 'price_1N0TeXGdoFKoCJW7htfCrFd7',
    }
  : {
      1399: 'price_1PJ2h0GdoFKoCJW7U1HE1SHZ',
      2999: 'price_1PJ2itGdoFKoCJW7QqWKG7YW',
      10999: 'price_1PJ2ffGdoFKoCJW70A20kUY7',
      100000: 'price_1N0Td3GdoFKoCJW7rbQYmwho',
    }

const mappedDollarAmounts = {
  1399: 10000,
  2999: 25000,
  10999: 100000,
  100000: 1000000,
} as { [key: string]: number }

export const createcheckoutsession = async (req: Request, res: Response) => {
  const userId = req.query.userId?.toString()

  const manticDollarQuantity = req.query.manticDollarQuantity?.toString()

  if (!userId) {
    res.status(400).send('Invalid user ID')
    return
  }

  if (
    !manticDollarQuantity ||
    !Object.keys(manticDollarStripePrice).includes(manticDollarQuantity)
  ) {
    res.status(400).send('Invalid Mantic Dollar quantity')
    return
  }

  const referrer =
    req.query.referer || req.headers.referer || 'https://manifold.markets'

  const stripe = initStripe()
  const session = await stripe.checkout.sessions.create({
    metadata: {
      userId,
      manticDollarQuantity,
    },
    line_items: [
      {
        price:
          manticDollarStripePrice[
            manticDollarQuantity as unknown as keyof typeof manticDollarStripePrice
          ],
        quantity: 1,
      },
    ],
    mode: 'payment',
    allow_promotion_codes: true,
    success_url: `${referrer}?funding-success`,
    cancel_url: `${referrer}?funding-failure`,
  })

  res.redirect(303, session.url || '')
}

export const stripewebhook = async (req: Request, res: Response) => {
  const stripe = initStripe()
  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'] as string,
      process.env.STRIPE_WEBHOOKSECRET as string
    )
  } catch (e: any) {
    log(`Webhook Error: ${e.message}`)
    res.status(400).send(`Webhook Error: ${e.message}`)
    return
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as StripeSession
    await issueMoneys(session)
  }

  res.status(200).send('success')
}

const issueMoneys = async (session: StripeSession) => {
  const { id: sessionId } = session
  const { userId, manticDollarQuantity } = session.metadata
  if (manticDollarQuantity === undefined) {
    log('skipping session', sessionId, '; no mana amount')
    return
  }
  const price = Number.parseInt(manticDollarQuantity)
  const deposit = mappedDollarAmounts[price] ?? price
  log('manticDollarQuantity', manticDollarQuantity, 'deposit', deposit)

  // TODO kill firestore collection when we get off stripe. too lazy to do it now
  const id = await firestore.runTransaction(async (trans) => {
    const query = await trans.get(
      firestore
        .collection('stripe-transactions')
        .where('sessionId', '==', sessionId)
    )
    if (!query.empty) {
      log('session', sessionId, 'already processed')
      return false
    }
    const stripeDoc = firestore.collection('stripe-transactions').doc()
    trans.set(stripeDoc, {
      userId,
      manticDollarQuantity: deposit, // save as number
      sessionId,
      session,
      timestamp: Date.now(),
    })

    return stripeDoc.id
  })
  if (!id) return

  const pg = createSupabaseDirectClient()

  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: deposit,
    token: 'M$',
    category: 'MANA_PURCHASE',
    data: { stripeTransactionId: id, type: 'stripe', paidInCents: price },
    description: `Deposit for mana purchase`,
  } as const

  let success = false
  try {
    await pg.tx(async (tx) => {
      await runTxn(tx, manaPurchaseTxn)
      await updateUser(tx, userId, {
        purchasedMana: true,
      })
    })
    success = true
  } catch (e) {
    log.error(
      'Must reconcile stripe-transactions with purchase txns. User may not have received mana!'
    )
    if (e instanceof APIError) {
      log.error('APIError in runTxn: ' + e.message)
    }
    log.error('Unknown error in runTxnFromBank' + e)
  }

  if (success) {
    log('user', userId, 'paid M$', deposit)
    const user = await getUser(userId)
    if (!user) {
      throw new APIError(500, 'User not found')
    }

    const privateUser = await getPrivateUser(userId)
    if (!privateUser) throw new APIError(500, 'Private user not found')

    await sendThankYouEmail(user, privateUser)
    log('stripe revenue', deposit / 100)

    await trackPublicEvent(
      userId,
      'M$ purchase',
      { amount: deposit, sessionId },
      { revenue: deposit / 100 }
    )
  }
}

const firestore = admin.firestore()
