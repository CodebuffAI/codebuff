// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import { setQuestScoreValueOnUsers } from 'common/supabase/set-scores'
import { QUEST_SCORE_IDS } from 'common/quest'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'
import { secrets } from 'common/secrets'
const DAILY_QUEST_SCORE_IDS = ['currentBettingStreak', 'sharesToday']
export const resetWeeklyQuestStats = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB', secrets })
  // 12am midnight on Monday Pacific time
  .pubsub.schedule(`0 0 * * 1`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await resetWeeklyQuestStatsInternal()
    } catch (e) {
      console.error(e)
    }
  })
export const resetDailyQuestStats = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB', secrets })
  // 12am midnight every day Pacific time
  .pubsub.schedule(`0 0 * * *`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await resetDailyQuestStatsInternal()
    } catch (e) {
      console.error(e)
    }
  })

export const resetWeeklyQuestStatsInternal = async () => {
  const pg = createSupabaseDirectClient()
  // Use direct connection to load more than 50k rows.
  const userIds = await pg.map<string>('select id from users', [], (r) => r.id)
  console.log(`Resetting quest stats for ${userIds.length} users`)

  const db = createSupabaseClient()
  const chunks = chunk(userIds, 1000)
  await Promise.all(
    chunks.map(async (chunk) => {
      await setQuestScoreValueOnUsers(
        chunk,
        QUEST_SCORE_IDS.filter((id) => !DAILY_QUEST_SCORE_IDS.includes(id)),
        0,
        db
      )
    })
  )
}
export const resetDailyQuestStatsInternal = async () => {
  const pg = createSupabaseDirectClient()
  // Use direct connection to load more than 50k rows.
  const userIds = await pg.map<string>('select id from users', [], (r) => r.id)
  console.log(`Resetting quest stats for ${userIds.length} users`)

  const db = createSupabaseClient()
  const chunks = chunk(userIds, 1000)
  await Promise.all(
    chunks.map(async (chunk) => {
      await setQuestScoreValueOnUsers(
        chunk,
        // resetBettingStreaksForUsers handles the betting streak quest
        ['sharesToday'],
        0,
        db
      )
    })
  )
}
