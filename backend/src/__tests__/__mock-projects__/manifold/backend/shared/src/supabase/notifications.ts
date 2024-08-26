import { Notification } from 'common/notification'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { broadcast } from 'shared/websockets/server'
import { bulkInsert } from 'shared/supabase/utils'

export const insertNotificationToSupabase = async (
  notification: Notification,
  pg: SupabaseDirectClient
) => {
  await pg.none(
    `insert into postgres.public.user_notifications (user_id, notification_id, data) values ($1, $2, $3) on conflict do nothing`,
    [notification.userId, notification.id, notification]
  )
  broadcast(`user-notifications/${notification.userId}`, { notification })
}

export const bulkInsertNotifications = async (
  notifications: Notification[],
  pg: SupabaseDirectClient
) => {
  await bulkInsert(
    pg,
    'user_notifications',
    notifications.map((n) => ({
      user_id: n.userId,
      notification_id: n.id,
      data: n,
    }))
  )
  notifications.forEach((notification) =>
    broadcast(`user-notifications/${notification.userId}`, { notification })
  )
}
