import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { convertGroup } from 'common/supabase/groups'

export const getGroup = async (props: { id: string } | { slug: string }) => {
  const pg = createSupabaseDirectClient()
  const group = await pg.oneOrNone(
    `select * from groups
            where ${'id' in props ? 'id' : 'slug'} = $1`,
    ['id' in props ? props.id : props.slug],
    (r) => (r ? convertGroup(r) : null)
  )
  if (!group) throw new APIError(404, 'Group not found')

  return group
}
