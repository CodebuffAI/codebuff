import { uniqBy } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import { convertGroup } from 'common/supabase/groups'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getGroups: APIHandler<'groups'> = async (props) => {
  const { availableToUserId, beforeTime, limit } = props
  const pg = createSupabaseDirectClient()
  const publicGroups = await pg.map(
    `
    select * from groups
    where privacy_status = 'public'
    and ($1 is null or (data->'createdTime')::bigint < $1)
    order by data->'createdTime' desc
    limit $2
    `,
    [beforeTime, limit],
    convertGroup
  )

  if (availableToUserId) {
    const memberGroups = await pg.map(
      `
      select * from groups
      where id in (
        select group_id from group_members
        where member_id = $1
      )
      `,
      [availableToUserId],
      convertGroup
    )
    return uniqBy(memberGroups.concat(publicGroups), 'id')
  } else {
    return publicGroups
  }
}
