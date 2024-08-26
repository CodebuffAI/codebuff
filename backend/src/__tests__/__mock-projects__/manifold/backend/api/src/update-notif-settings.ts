import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { type APIHandler } from './helpers/endpoint'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

export const updateNotifSettings: APIHandler<'update-notif-settings'> = async (
  { type, medium, enabled },
  auth
) => {
  const pg = createSupabaseDirectClient()
  if (type === 'opt_out_all' && medium === 'mobile') {
    await updatePrivateUser(pg, auth.uid, {
      interestedInPushNotifications: !enabled,
    })
  } else {
    // deep update array at data.notificationPreferences[type]
    await pg.none(
      `update private_users
      set data = jsonb_set(data, '{notificationPreferences, $1:raw}',
        coalesce(data->'notificationPreferences'->$1, '[]'::jsonb)
        ${enabled ? `|| '[$2:name]'::jsonb` : `- $2`}
      )
      where id = $3`,
      [type, medium, auth.uid]
    )
    broadcastUpdatedPrivateUser(auth.uid)
  }
}
