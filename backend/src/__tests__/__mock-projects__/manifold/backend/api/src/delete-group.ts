import { isAdminId, isModId } from 'common/envs/constants'
import { run } from 'common/supabase/utils'
import { log } from 'shared/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError, type AuthedUser } from './helpers/endpoint'

export const deleteGroup = async (
  props: { id: string } | { slug: string },
  auth: AuthedUser
) => {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  const q = db.from('groups').select()
  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('slug', props.slug)
  }

  const { data: groups } = await run(q)

  if (groups.length == 0) {
    throw new APIError(404, 'Group not found')
  }

  const group = groups[0]

  log(
    `delete group ${group.name} ${group.slug} initiated by ${auth.uid}`,
    group
  )

  const id = group.id

  if (!isModId(auth.uid) && !isAdminId(auth.uid)) {
    const requester = await pg.oneOrNone(
      'select role from group_members where group_id = $1 and member_id = $2',
      [id, auth.uid]
    )

    if (requester?.role !== 'admin') {
      throw new APIError(403, 'You do not have permission to delete this group')
    }
  }

  // fail if there are contracts tagged with this group
  // we could just untag contracts like in scripts/deleteGroup.ts
  // but I don't trust the mods. I'm forcing them to manually untag or retag contracts to make them reckon with the responsibility of what deleting a group means.
  const { count: contractCount } = await pg.one(
    `select count(*) from group_contracts where group_id = $1`,
    [id]
  )

  if (contractCount > 0) {
    throw new APIError(
      400,
      `Only topics with no questions can be deleted. There are still ${contractCount} questions tagged with this topic.`
    )
  }

  await pg.tx(async (tx) => {
    log('removing group members')
    await tx.none('delete from group_members where group_id = $1', [id])
    log('deleting group ', id)
    await tx.none('delete from groups where id = $1', [id])
  })
}
