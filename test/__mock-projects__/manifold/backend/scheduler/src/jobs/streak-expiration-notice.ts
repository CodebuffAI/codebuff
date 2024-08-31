import { getBettingStreakResetTimeBeforeNow, isProd, log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createBettingStreakExpiringNotification } from 'shared/create-notification'

export const sendStreakExpirationNotification = async () => {
  if (!isProd()) return
  const mostRecentResetTime = getBettingStreakResetTimeBeforeNow()
  log('Most recent streak reset time', mostRecentResetTime)
  const pg = createSupabaseDirectClient()
  const expiringStreakBettors = await pg.map(
    `
    select
      id, (data->'currentBettingStreak')::int as streak
    from users
    where
        (data->'lastBetTime')::bigint < $1
      and (data->'currentBettingStreak')::int > 0
      and (data->'streakForgiveness')::int = 0
    `,
    [mostRecentResetTime],
    (row) => [row.id as string, row.streak as number] as [string, number]
  )
  log('expiringStreakBettors', expiringStreakBettors.length)
  await createBettingStreakExpiringNotification(expiringStreakBettors, pg)
}
