import { run } from 'common/supabase/utils'
import { User } from '../firebase/users'
import { db } from './db'
import { convertGroup } from 'common/supabase/groups'
import { GroupRole } from 'common/group'

export const MEMBER_LOAD_NUM = 50

export async function getMemberRole(user: User, groupId: string) {
  const { data } = await run(
    db
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('member_id', user.id)
  )
  return (data[0]?.role ?? 'member') as GroupRole
}

export async function getGroupContractIds(groupId: string) {
  const groupContractIds = await run(
    db.from('group_contracts').select('contract_id').eq('group_id', groupId)
  )
  return groupContractIds.data.map((gids) => gids.contract_id)
}

export async function getGroup(groupId: string) {
  const { data } = await run(
    db.from('groups').select('data, id').eq('id', groupId)
  )
  if (data && data.length > 0) {
    return convertGroup(data[0])
  } else {
    return null
  }
}

export async function getGroupFromSlug(groupSlug: string) {
  const { data } = await run(db.from('groups').select().eq('slug', groupSlug))

  if (data && data.length > 0) {
    return convertGroup(data[0])
  }

  // we append 8 hex characters to slugs that collide with existing groups
  // and some of those groups got deleted, so we redirect to the main "big" group
  if (/-\w{12}$/.test(groupSlug)) {
    const baseSlug = groupSlug.replace(/-\w{12}$/, '')

    const { data } = await run(db.from('groups').select().eq('slug', baseSlug))
    if (data && data.length > 0) {
      return convertGroup(data[0])
    }
  }

  return null
}
