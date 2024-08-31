import * as functions from 'firebase-functions'
import { sum } from 'lodash'

import { getUsersContractMetricsOrderedByProfit } from 'common/supabase/contract-metrics'
import { createWeeklyPortfolioUpdateNotification } from 'shared/create-notification'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseClient,
} from 'shared/supabase/init'
import { getUser, getUsers, log } from 'shared/utils'
import { secrets } from 'common/secrets'
import { bulkInsert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'

import * as dayjs from 'dayjs'
import { Row } from 'common/supabase/utils'
import { ContractMetric } from 'common/contract-metric'
import { convertPrivateUser } from 'common/supabase/users'

const now = new Date()
const time = now.getTime()

const getDate = () => dayjs(now).format('YYYY-MM-DD')

const USERS_TO_SAVE = 300
// Saving metrics should work until our users are greater than USERS_TO_SAVE * 2*60 users
export const saveWeeklyContractMetrics = functions
  .runWith({ memory: '4GB', secrets, timeoutSeconds: 60 })
  // every minute for 2 hours Friday 4am PT (UTC -08:00)
  .pubsub.schedule('* 13-14 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await saveWeeklyContractMetricsInternal()
  })

export const sendWeeklyPortfolioUpdate = functions
  .runWith({ memory: '8GB', secrets, timeoutSeconds: 540 })
  // every Friday at 12pm PT (UTC -08:00)
  .pubsub.schedule('0 20 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendWeeklyPortfolioUpdateNotifications()
  })

export const saveWeeklyContractMetricsInternal = async () => {
  const db = createSupabaseClient()

  // users who have disabled browser notifications for profit/loss updates won't be able to see their portfolio updates in the past
  const privateUsersQuery = await db
    .from('private_users')
    .select('id')
    .contains(
      `data->'notificationPreferences'->'profit_loss_updates'`,
      'browser'
    )

  if (privateUsersQuery.error) {
    throw new APIError(
      500,
      'Error getting private users: ',
      privateUsersQuery.error
    )
  }
  const privateUsers = privateUsersQuery.data

  const alreadyUpdatedQuery = await db
    .from('weekly_update')
    .select('user_id')
    .eq('range_end', getDate())

  if (alreadyUpdatedQuery.error) {
    throw new APIError(
      500,
      'Error getting already updated users: ',
      alreadyUpdatedQuery.error
    )
  }

  const alreadyUpdated = alreadyUpdatedQuery.data.map((r) => r.user_id)

  log('already updated users', alreadyUpdated.length, 'at', time)
  // filter out the users who have already had their weekly update saved
  const usersToSave = privateUsers
    .filter((user) => !alreadyUpdated.includes(user.id))
    .slice(0, USERS_TO_SAVE)

  log('usersToSave', usersToSave.length)
  if (usersToSave.length === 0) return

  // TODO: try out the new rpc call
  const usersToContractMetrics = await getUsersContractMetricsOrderedByProfit(
    usersToSave.map((u) => u.id),
    db,
    'week'
  )
  if (Object.keys(usersToContractMetrics).length === 0) {
    log('Error: no contract metrics to save')
    return
  }

  const results = await Promise.all(
    usersToSave.map(async (privateUser) => {
      const user = await getUser(privateUser.id)
      const contractMetrics = usersToContractMetrics[privateUser.id]
      return {
        contract_metrics: contractMetrics,
        user_id: privateUser.id,
        profit:
          user?.profitCached.weekly ??
          sum(contractMetrics.map((m) => m.from?.week.profit ?? 0)),
        range_end: getDate(),
      }
    })
  )

  const pg = createSupabaseDirectClient()
  await bulkInsert(pg, 'weekly_update', results)

  log('saved weekly contract metrics for users:', usersToSave.length)
}

export const sendWeeklyPortfolioUpdateNotifications = async () => {
  const db = createSupabaseClient()

  // get all users who have opted in to weekly portfolio updates
  const privateUsersQuery = await db
    .from('private_users')
    .select()
    .contains(
      `data->'notificationPreferences'->'profit_loss_updates'`,
      'browser'
    )

  if (privateUsersQuery.error) {
    throw new APIError(
      500,
      'Error getting private users: ',
      privateUsersQuery.error
    )
  }
  const privateUsers = privateUsersQuery.data.map(convertPrivateUser)

  const userData = await getUsers(privateUsers.map((u) => u.id))
  const usernameById = Object.fromEntries(
    userData.map((u) => [u.id, u.username])
  )
  log('users to send weekly portfolio updates to', privateUsers.length)
  let count = 0
  const now = getDate()
  await Promise.all(
    privateUsers.map(async (privateUser) => {
      const data = await getUsersWeeklyUpdate(db, privateUser.id, now)
      if (!data) return
      const { profit, range_end, contract_metrics } = data
      const contractMetrics = contract_metrics as ContractMetric[]
      // Don't send update if there are no contracts
      count++
      if (count % 100 === 0)
        log('sent weekly portfolio updates to', count, '/', privateUsers.length)
      if (contractMetrics.length === 0) return
      await createWeeklyPortfolioUpdateNotification(
        privateUser,
        usernameById[privateUser.id],
        profit,
        range_end
      )
    })
  )
}

const getUsersWeeklyUpdate = async (
  db: SupabaseClient,
  userId: string,
  rangeEnd: string
) => {
  const { data, error } = await db
    .from('weekly_update')
    .select('*')
    .eq('user_id', userId)
    .eq('range_end', rangeEnd)
    .order('created_time', { ascending: false })
    .limit(1)

  if (error) {
    console.error(error)
    return
  }
  if (!data.length) {
    return
  }

  return data[0] as Row<'weekly_update'>
}
