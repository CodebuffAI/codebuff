import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { removeNullOrUndefinedProps } from 'common/util/object'

export const getUser = async (props: { id: string } | { username: string }) => {
  const pg = createSupabaseDirectClient()
  const user = await pg.oneOrNone(
    `select * from users
            where ${'id' in props ? 'id' : 'username'} = $1`,
    ['id' in props ? props.id : props.username],
    (r) => (r ? convertUser(r) : null)
  )
  if (!user) throw new APIError(404, 'User not found')

  return toUserAPIResponse(user)
}

export const getLiteUser = async (
  props: { id: string } | { username: string }
) => {
  const pg = createSupabaseDirectClient()
  const liteUser = await pg.oneOrNone(
    `select id, name, username, data->>'avatarUrl' as "avatarUrl", data->'isBannedFromPosting' as "isBannedFromPosting"
            from users
            where ${'id' in props ? 'id' : 'username'} = $1`,
    ['id' in props ? props.id : props.username]
  )
  if (!liteUser) throw new APIError(404, 'User not found')

  return removeNullOrUndefinedProps(liteUser)
}
