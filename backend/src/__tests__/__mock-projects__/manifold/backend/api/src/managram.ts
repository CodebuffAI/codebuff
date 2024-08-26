import { isVerified } from 'common/user'
import { canSendMana } from 'common/can-send-mana'
import { APIError, type APIHandler } from './helpers/endpoint'
import { insertTxns } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'
import { isAdminId } from 'common/envs/constants'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getUsers, isProd } from 'shared/utils'
import { bulkIncrementBalances } from 'shared/supabase/users'
import { buildArray } from 'common/util/array'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { BURN_MANA_USER_ID } from 'common/economy'
import { betsQueue } from 'shared/helpers/fn-queue'

export const managram: APIHandler<'managram'> = async (props, auth) => {
  const { amount, toIds, message, token, groupId: passedGroupId } = props
  const fromId = auth.uid

  if (!isAdminId(fromId) && amount < 10) {
    throw new APIError(403, 'Only admins can send less than 10 mana')
  }
  if (toIds.includes(fromId)) {
    throw new APIError(400, 'Cannot send mana to yourself.')
  }

  if (toIds.length <= 0) {
    throw new APIError(400, 'Destination users not found.')
  }

  const pg = createSupabaseDirectClient()

  const fromUser = await betsQueue.enqueueFn(async () => {
    // Run as transaction to prevent race conditions.
    return await pg.tx(async (tx) => {
      const fromUser = await getUser(fromId, tx)
      if (!fromUser) {
        throw new APIError(401, `User ${fromId} not found`)
      }

      if (!isVerified(fromUser)) {
        throw new APIError(
          403,
          'You must verify your phone number to send mana.'
        )
      }

      const { canSend, message: errorMessage } = await canSendMana(
        fromUser,
        () => getUserPortfolioInternal(fromUser.id)
      )
      if (!canSend) {
        throw new APIError(403, errorMessage)
      }

      if (token === 'PP') {
        const ManifoldAccount = isProd()
          ? HOUSE_LIQUIDITY_PROVIDER_ID
          : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

        if (fromId !== ManifoldAccount) {
          if (toIds.length > 1)
            throw new APIError(
              400,
              'You cannot send prize points to multiple users.'
            )
          if (toIds[0] !== ManifoldAccount)
            throw new APIError(
              400,
              'Do send prize points only to @ManifoldMarkets.'
            )
        }
      }

      const total = amount * toIds.length
      const balance = token === 'M$' ? fromUser.balance : fromUser.spiceBalance
      if (balance < total) {
        throw new APIError(
          403,
          `Insufficient balance: ${fromUser.name} needed ${
            amount * toIds.length
          } but only had ${balance} `
        )
      }

      const toUsers = await getUsers(toIds, tx)
      if (toUsers.length !== toIds.length) {
        throw new APIError(404, 'Some destination users not found.')
      }
      if (toUsers.some((toUser) => !isVerified(toUser))) {
        throw new APIError(403, 'All destination users must be verified.')
      }

      const balanceField = token === 'M$' ? 'balance' : 'spiceBalance'

      await bulkIncrementBalances(
        tx,
        buildArray(
          {
            id: fromId,
            [balanceField]: -total,
            totalDeposits: -total,
          },
          toIds
            .filter((id) => id !== BURN_MANA_USER_ID)
            .map((toId) => ({
              id: toId,
              [balanceField]: amount,
              totalDeposits: amount,
            }))
        )
      )

      const groupId = passedGroupId ? passedGroupId : crypto.randomUUID()

      const txns = toIds.map(
        (toId) =>
          ({
            fromId: auth.uid,
            fromType: 'USER',
            toId,
            toType: 'USER',
            amount,
            token: token === 'M$' ? 'M$' : 'SPICE',
            category: 'MANA_PAYMENT',
            data: {
              message,
              groupId,
              visibility: 'public',
            },
            description: message || 'Mana payment',
          } as const)
      )
      await pg.tx((tx) => insertTxns(tx, txns))

      return fromUser
    })
  }, [fromId, ...toIds])

  await Promise.all(
    toIds.map((toId) =>
      createManaPaymentNotification(fromUser, toId, amount, message)
    )
  )
}
