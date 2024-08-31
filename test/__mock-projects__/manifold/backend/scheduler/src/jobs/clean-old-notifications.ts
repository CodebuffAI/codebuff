import { chunk } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export async function cleanOldNotifications() {
  log('Running clean old notifications...')
  const pg = createSupabaseDirectClient()
  const userIds = await pg.map(
    `select distinct id from users`,
    [],
    (r) => r.id as string
  )
  const chunks = chunk(userIds, 500)

  for (const batch of chunks) {
    const query = `
      delete from user_notifications
      where (user_id, notification_id) in (
          select user_id, notification_id from (
             select
                 user_id,
                 notification_id,
                 row_number() over (
                     partition by user_id
                     order by ((data->'createdTime')::bigint) desc
                     ) as rn
             from
                 user_notifications
             where
                 user_id in ($1:list)
         ) as user_notif_rows
          where
              rn > 1000
          )`
    await pg.none(query, [batch])
    log(`Deleted notifications from ${batch.length} users`)
  }
}
