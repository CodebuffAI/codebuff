import { type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const hasFreeLike: APIHandler<'has-free-like'> = async (
  _props,
  auth
) => {
  return {
    status: 'success',
    hasFreeLike: await getHasFreeLike(auth.uid),
  }
}

export const getHasFreeLike = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  const likeGivenToday = await pg.oneOrNone<object>(
    `
    select 1
    from love_likes
    where creator_id = $1
      and created_time at time zone 'UTC' at time zone 'America/Los_Angeles' >= (now() at time zone 'UTC' at time zone 'America/Los_Angeles')::date
      and created_time at time zone 'UTC' at time zone 'America/Los_Angeles' < ((now() at time zone 'UTC' at time zone 'America/Los_Angeles')::date + interval '1 day')
    limit 1
    `,
    [userId]
  )
  return !likeGivenToday
}
