import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { GroupAboutSchema, GroupNameSchema } from 'common/group'
import { log } from 'shared/utils'

const schema = z
  .object({
    id: z.string(),
    about: GroupAboutSchema.optional(),
    name: GroupNameSchema.optional(),
    bannerUrl: z.string().optional(),
  })
  .strict()

export const updategroup = authEndpoint(async (req, auth) => {
  const data = validate(schema, req.body)
  const db = createSupabaseDirectClient()

  if (!isModId(auth.uid) && !isAdminId(auth.uid)) {
    const requester = await db.oneOrNone(
      'select role from group_members where group_id = $1 and member_id = $2',
      [data.id, auth.uid]
    )

    if (requester?.role !== 'admin') {
      throw new APIError(403, 'You do not have permission to update this group')
    }
  }

  if (data.name) {
    const existingName = await db.oneOrNone(
      `select 1 from groups where name = $1`,
      [data.name]
    )
    if (existingName) {
      throw new APIError(400, `The group ${data.name} already exists`)
    }
  }

  log(
    `update group initiated by ${auth.uid}: `,
    Object.entries(data).flat().join(' ')
  )
  await updateData(db, 'groups', 'id', data)
  return { status: 'success' }
})
