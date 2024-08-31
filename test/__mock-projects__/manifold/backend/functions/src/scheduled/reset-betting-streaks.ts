// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
import { secrets } from 'common/secrets'
import * as functions from 'firebase-functions'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const resetBettingStreaksForUsers = functions
  .runWith({ timeoutSeconds: 540, secrets })
  .pubsub.schedule(`0 ${BETTING_STREAK_RESET_HOUR} * * *`)
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await resetBettingStreaksInternal()
  })

const resetBettingStreaksInternal = async () => {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update users
    set data = data || 
      case when (data->'streakForgiveness')::numeric > 0 then
        jsonb_build_object('streakForgiveness', (data->'streakForgiveness')::numeric - 1)
      else
        jsonb_build_object('currentBettingStreak', 0)
      end
    where (data->'currentBettingStreak')::numeric > 0
    and (data->'lastBetTime')::numeric < ts_to_millis(now() - interval '1 day')`
  )
}
