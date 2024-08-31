import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { convertGroup } from 'common/supabase/groups'

export const getFollowedGroups: APIHandler<
  'get-followed-groups'
> = async (props: { userId: string }) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()
  const groups = await pg.map(
    `select groups.*
    from group_members
    join groups on group_members.group_id = groups.id
    where member_id = $1
    order by groups.importance_score desc
  `,
    [userId],
    (row) => convertGroup(row)
  )
  return {
    groups,
  }
}
