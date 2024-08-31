import { DAY_MS } from 'common/util/time'
import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'
import { SupabaseDirectClient } from 'shared/supabase/init'

export const backfillUserTopicInterests = async (pg: SupabaseDirectClient) => {
  const MAX_DAYS = 100
  const now = Date.now()
  console.log('Starting topic interests')
  const startTimes = []
  const startOfViewRecordings = new Date(
    '2024-04-23 20:58:27.224596 +00:00'
  ).valueOf()
  const TEST_USER_ID: string | undefined = undefined
  const READONLY = false
  for (let i = 0; i < MAX_DAYS; i++) {
    const startTime = now - DAY_MS * (MAX_DAYS - i)
    if (startTime < startOfViewRecordings) continue
    console.log('Topic interests iteration:', i)
    await calculateUserTopicInterests(
      startTime,
      READONLY,
      TEST_USER_ID,
      startTimes
    )
    startTimes.push(new Date(startTime).toISOString())
  }
  console.log('Deleting interests not in processed start times:', startTimes)
  if (!READONLY)
    await pg.none(
      `delete from user_topic_interests where created_time not in ($1:list)
                and ($2 is null or  user_id = $2)`,
      [startTimes, TEST_USER_ID]
    )
}
