import { type APIHandler } from './helpers/endpoint'
import { removeUndefinedProps } from 'common/util/object'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

export const saveTwitchCredentials: APIHandler<'save-twitch'> = async (
  props,
  auth
) => {
  // partial update
  const pg = createSupabaseDirectClient()
  await pg.none(
    `update private_users
    set data = data || jsonb_build_object(
      'twitchInfo',
      data->'twitchInfo' || $1::jsonb
    )
    where id = $2`,
    [removeUndefinedProps(props.twitchInfo), auth.uid]
  )

  broadcastUpdatedPrivateUser(auth.uid)
}
