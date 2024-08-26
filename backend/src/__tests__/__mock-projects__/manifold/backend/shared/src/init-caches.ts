import { buildUserInterestsCache } from 'shared/topic-interests'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
export const DEBUG_TOPIC_INTERESTS = process.platform === 'darwin'

export const initCaches = async (timeoutId: NodeJS.Timeout) => {
  if (DEBUG_TOPIC_INTERESTS) {
    clearTimeout(timeoutId)
    return
  }
  const pg = createSupabaseDirectClient()
  log('Connected to the db')
  const activeUserIdsToCacheInterests = await pg.map(
    `select distinct user_id from user_contract_interactions
              where created_time > now() - interval $1`,
    ['3 months'],
    (r) => r.user_id as string
  )
  clearTimeout(timeoutId)
  log(
    'Active user ids to cache interests: ',
    activeUserIdsToCacheInterests.length
  )
  await buildUserInterestsCache(activeUserIdsToCacheInterests)
}
