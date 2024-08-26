import { DESTINY_GROUP_SLUG } from 'common/envs/constants'
import { run, SupabaseClient } from 'common/supabase/utils'
import { db } from './db'
import { Contract } from 'common/contract'
import { convertGroup } from 'common/supabase/groups'

export async function getGroupContracts(groupId: string) {
  const { data } = await run(
    db.rpc('get_group_contracts', {
      this_group_id: groupId,
    })
  )
  if (data && data.length > 0) {
    return data.map((contract) => contract.data as Contract)
  }
  return []
}

export async function getShouldBlockDestiny(
  userId: string,
  db: SupabaseClient
) {
  const groupIds = await getMemberGroupIds(userId, db)
  const { data } = await run(
    db
      .from('groups')
      .select('data')
      .eq('slug', DESTINY_GROUP_SLUG)
      .in('id', groupIds)
  )

  return data.length === 0
}

export async function getMemberGroupIds(userId: string, db: SupabaseClient) {
  const { data: groupIds } = await run(
    db.from('group_members').select('group_id').eq('member_id', userId)
  )

  return groupIds ? groupIds.map((groupId) => groupId.group_id) : []
}

export async function getMemberGroupsCount(userId: string) {
  const { count } = await run(
    db
      .from('group_members')
      .select('*', { head: true, count: 'exact' })
      .eq('member_id', userId)
  )
  return count
}

// gets all groups where the user is an admin or moderator
export async function getGroupsWhereUserHasRole(userId: string) {
  const { data } = await run(
    db
      .from('group_members')
      .select('group_id')
      .eq('member_id', userId)
      .or('role.eq.admin,role.eq.moderator')
  )

  return data.map((row) => row.group_id)
}

export async function getGroupBySlug(groupSlug: string) {
  const { data } = await run(
    db.from('groups').select().eq('slug', groupSlug).limit(1)
  )
  return data?.length ? convertGroup(data[0]) : null
}

export async function getGroups(groupIds: string[]) {
  const { data } = await run(
    db.from('groups').select('id,data').in('id', groupIds)
  )
  return data?.map(convertGroup)
}

export async function getGroupContractIds(groupId: string) {
  const { data } = await run(
    db.from('group_contracts').select('contract_id').eq('group_id', groupId)
  )
  if (data) {
    return data.map((group) => group.contract_id)
  }
  return []
}

export async function listGroupsBySlug(groupSlugs: string[]) {
  const { data } = await run(db.from('groups').select().in('slug', groupSlugs))
  if (data) {
    return data.map(convertGroup)
  }
  return []
}

export async function unfollowTopic(groupId: string, userId: string) {
  await run(
    db
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('member_id', userId)
  )
}
