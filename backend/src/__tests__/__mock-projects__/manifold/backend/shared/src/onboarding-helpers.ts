import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  MARKET_VISIT_BONUS,
  MARKET_VISIT_BONUS_TOTAL,
  NEXT_DAY_BONUS,
} from 'common/economy'
import { getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { SignupBonusTxn } from 'common/txn'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
  isVerified,
} from 'common/user'
import {
  getNotificationDestinationsForUser,
  userOptedOutOfBrowserNotifications,
} from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import * as crypto from 'crypto'
import {
  sendBonusWithInterestingMarketsEmail,
  sendUnactivatedNewUserEmail,
} from 'shared/emails'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { APIError } from 'common/api/utils'
import { getForYouMarkets } from 'shared/weekly-markets-emails'
import { updatePrivateUser, updateUser } from './supabase/users'
import { convertUser } from 'common/supabase/users'

/*
D1 send mana bonus email
*/
export async function sendOnboardingNotificationsInternal() {
  if (!isProd()) return
  const pg = createSupabaseDirectClient()

  const recentUsers = await pg.map(
    `select * from users
          where
              -- adding padding in case the scheduler went down
              created_time < now() - interval '23 hours' and
              created_time > now() - interval '1 week' and
              (data->>'fromLove' is null or data->>'fromLove' = 'false')
              `,
    [],
    convertUser
  )

  log(
    'Non love users created older than 1 day, younger than 1 week:' +
      recentUsers.length
  )
  const verifiedUsers = recentUsers.filter(isVerified)

  await Promise.all(verifiedUsers.map(sendNextDayManaBonus))
  const unactivatedUsers = recentUsers.filter((user) => !user.lastBetTime)
  const templateId = 'didnt-bet-new-user-survey'
  const unactivatedUsersSentEmailAlready = await pg.map(
    `select distinct users.id from users
            join sent_emails on users.id = sent_emails.user_id
            where users.id = any($1)
            and sent_emails.email_template_id = $2`,
    [unactivatedUsers.map((user) => user.id), templateId],
    (row) => row.id
  )

  await Promise.all(
    unactivatedUsers
      .filter((user) => !unactivatedUsersSentEmailAlready.includes(user.id))
      .map(async (user) => {
        await sendUnactivatedNewUserEmail(user, templateId)
        await pg.none(
          `insert into sent_emails (user_id, email_template_id) values ($1, $2)`,
          [user.id, templateId]
        )
      })
  )
}

const sendNextDayManaBonus = async (user: User) => {
  const pg = createSupabaseDirectClient()

  const { txn, privateUser } = await pg.tx(async (tx) => {
    const privateUser = await getPrivateUser(user.id, tx)
    if (!privateUser) throw new APIError(404, `private user not found`)

    if (privateUser.manaBonusSent) {
      log(`User ${user.id} already received mana bonus`)
      return {}
    } else {
      await updatePrivateUser(tx, user.id, {
        manaBonusSent: true,
        weeklyTrendingEmailSent: true, // not yet, but about to!
      })
    }

    const signupBonusTxn: Omit<
      SignupBonusTxn,
      'fromId' | 'id' | 'createdTime'
    > = {
      fromType: 'BANK',
      amount: NEXT_DAY_BONUS,
      category: 'SIGNUP_BONUS',
      toId: user.id,
      token: 'M$',
      toType: 'USER',
      description: 'Next day signup bonus',
    }

    const txn = await runTxnFromBank(tx, signupBonusTxn)
    return { txn, privateUser }
  })

  if (!txn) return

  log(`Sent mana bonus to user ${user.id}`)

  await createSignupBonusNotification(user, privateUser, txn.id, NEXT_DAY_BONUS)
}

export const sendOnboardingMarketVisitBonus = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    const user = await getUser(userId, tx)

    if (!user) {
      throw new APIError(404, `User ${userId} not found`)
    }

    if (!isVerified(user)) {
      throw new APIError(403, 'User not yet verified phone number.')
    }

    if (user.signupBonusPaid === undefined) {
      throw new APIError(
        403,
        `User ${userId} not eligible for market visit bonus`
      )
    }

    if (user.signupBonusPaid >= MARKET_VISIT_BONUS_TOTAL) {
      throw new APIError(
        403,
        `User ${userId} already received ${
          MARKET_VISIT_BONUS_TOTAL / MARKET_VISIT_BONUS
        } market visit bonuses`
      )
    }

    await updateUser(tx, user.id, {
      signupBonusPaid: user.signupBonusPaid + MARKET_VISIT_BONUS,
    })

    const signupBonusTxn: Omit<
      SignupBonusTxn,
      'fromId' | 'id' | 'createdTime'
    > = {
      fromType: 'BANK',
      amount: MARKET_VISIT_BONUS,
      category: 'SIGNUP_BONUS',
      toId: userId,
      token: 'M$',
      toType: 'USER',
      description: 'New user market visit bonus',
    }

    const txn = await runTxnFromBank(tx, signupBonusTxn)
    log(`Sent mana bonus to user ${userId}`)
    return txn
  })
}

const createSignupBonusNotification = async (
  user: User,
  privateUser: PrivateUser,
  txnId: string,
  bonusAmount: number
) => {
  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: txnId,
      sourceType: 'signup_bonus',
      sourceUpdateType: 'created',
      sourceUserName: MANIFOLD_USER_NAME,
      sourceUserUsername: MANIFOLD_USER_USERNAME,
      sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
      sourceText: bonusAmount.toString(),
    }
    const pg = createSupabaseDirectClient()
    await insertNotificationToSupabase(notification, pg)
  }

  // This is email is of both types, so try either
  const { sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )
  const { sendToEmail: trendingSendToEmail } =
    getNotificationDestinationsForUser(privateUser, 'trending_markets')

  if (!sendToEmail && !trendingSendToEmail) {
    log(
      `User opted out of onboarding email, onboarding_flow: ${sendToEmail} 'trending_markets:', ${trendingSendToEmail}`
    )
    return
  }

  const contractsToSend = await getForYouMarkets(privateUser.id, 6, privateUser)

  await sendBonusWithInterestingMarketsEmail(
    user,
    privateUser,
    contractsToSend,
    bonusAmount
  )
}
