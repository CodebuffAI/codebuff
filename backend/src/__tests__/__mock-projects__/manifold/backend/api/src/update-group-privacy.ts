import { z } from 'zod'
import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { Group } from 'common/group'

const bodySchema = z
  .object({
    groupId: z.string(),
    privacy: z.enum(['public', 'curated']),
  })
  .strict()

export const updategroupprivacy = authEndpoint(async (req, auth) => {
  const { groupId, privacy } = validate(bodySchema, req.body)

  // TODO: move to single supabase transaction
  const db = createSupabaseClient()

  const userMembership = (
    await db
      .from('group_members')
      .select()
      .eq('member_id', auth.uid)
      .eq('group_id', groupId)
      .limit(1)
  ).data

  const requester = userMembership?.length ? userMembership[0] : null

  const groupQuery = await db.from('groups').select().eq('id', groupId).limit(1)

  if (groupQuery.error) throw new APIError(500, groupQuery.error.message)
  if (!groupQuery.data.length) throw new APIError(404, 'Group cannot be found')
  if (!userMembership?.length)
    throw new APIError(404, 'You cannot be found in group')

  const group = groupQuery.data[0]
  console.log(group)

  if (requester?.role !== 'admin' && !isAdminId(auth.uid))
    throw new APIError(
      403,
      'You do not have permission to change group privacy'
    )

  if (privacy == group.privacy_status) {
    throw new APIError(403, 'Group privacy is already set to this!')
  }
  // TODO: we need to figure out the role of the data column for the migration plan
  await db
    .from('groups')
    .update({
      data: {
        ...(group.data as Group),
        privacyStatus: privacy,
      },
    })
    .eq('id', groupId)

  return { status: 'success', message: 'Group privacy updated' }
})
