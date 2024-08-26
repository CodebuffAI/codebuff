import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers/endpoint'
const bodySchema = z
  .object({
    groupSlug: z.string(),
  })
  .strict()

export const getuserisgroupmember = authEndpoint(async (req, auth) => {
  const { groupSlug } = validate(bodySchema, req.body)
  if (!auth.uid) {
    return { isGroupMember: false }
  }
  const pg = createSupabaseDirectClient()
  const { id: groupId } = await pg.one(
    'select id from groups where slug = $1',
    [groupSlug]
  )
  const userIsMember = await pg.one(
    `select exists(
        select * from group_members
        where group_id = $1
        and member_id= $2)`,
    [groupId, auth.uid]
  )
  return { isGroupMember: userIsMember.exists }
})
