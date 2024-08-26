import { Contract } from 'common/contract'
import { Group, GroupRole, LiteGroup, Topic } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { api, getUserIsFollowingTopic } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import {
  getGroup,
  getGroupFromSlug,
  getMemberRole,
} from 'web/lib/supabase/group'
import {
  getGroupsWhereUserHasRole,
  listGroupsBySlug,
} from 'web/lib/supabase/groups'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useIsAuthorized } from './use-user'
import { Row } from 'common/supabase/utils'
import { useAsyncData } from 'web/hooks/use-async-data'
import { isAdminId, isModId } from 'common/envs/constants'

export function useIsFollowingTopic(groupSlug?: string) {
  const [isFollowing, setIsFollowing] = usePersistentInMemoryState<
    boolean | undefined
  >(undefined, 'is-member-' + groupSlug)
  const isAuthorized = useIsAuthorized()
  useEffect(() => {
    if (!isAuthorized || !groupSlug) {
      setIsFollowing(false)
    } else {
      getUserIsFollowingTopic({ groupSlug }).then((result) => {
        setIsFollowing(result.isGroupMember)
      })
    }
  }, [groupSlug, isAuthorized])
  return { isFollowing, setIsFollowing }
}

export function useMemberGroupIdsOnLoad(
  userId: string | undefined | null
): string[] | undefined {
  const [groupIds, setGroupIds] = usePersistentInMemoryState<
    string[] | undefined
  >(undefined, `member-group-ids-${userId ?? ''}`)
  useEffect(() => {
    if (!userId) return
    db.from('group_members')
      .select('group_id')
      .eq('member_id', userId)
      .then((result) => {
        if (result) {
          const groupIds = (result as any).data.map((row: any) => row.group_id)
          setGroupIds(groupIds)
        }
      })
  }, [userId])
  return groupIds
}

export const useTopicsWithContract = (
  contractId: string,
  initial?: Topic[]
) => {
  const [topics, setTopics] = useState<Topic[]>(initial ?? [])

  const addTopic = async (topic: Topic) => {
    await api('market/:contractId/group', { contractId, groupId: topic.id })
    setTopics((prev) => [...(prev ?? []), topic])
  }

  const removeTopic = async (topic: Topic) => {
    await api('market/:contractId/group', {
      contractId,
      groupId: topic.id,
      remove: true,
    })
    setTopics((prev) => prev?.filter((g) => g.id !== topic.id))
  }

  return { topics, addTopic, removeTopic }
}

export function useNewUserMemberTopicsAndContracts(
  user: User | null | undefined,
  enabled: boolean
) {
  type TopicWithContracts = {
    topic: Topic
    contracts: Contract[]
  }
  const [groups, setGroups] = usePersistentInMemoryState<
    TopicWithContracts[] | undefined
  >(undefined, `member-topics-and-contracts-${user?.id ?? ''}`)

  useEffect(() => {
    if (!groups?.length) setGroups(undefined) // Show loading indicator right after selecting topics
    if (enabled)
      api('get-groups-with-top-contracts', {}).then((result) => {
        setGroups(result)
      })
    else setGroups([])
  }, [enabled, user?.shouldShowWelcome])

  return groups
}

export function useGroupRole(
  groupId: string | undefined,
  user: User | null | undefined
) {
  const [userRole, setUserRole] = useState<GroupRole | null | undefined>(
    undefined
  )
  const isMod = !user ? false : isModId(user.id) || isAdminId(user.id)
  useEffect(() => {
    getTranslatedMemberRole(groupId, user).then((role) => setUserRole(role))
  }, [user, groupId])

  return isMod ? 'admin' : userRole
}

export async function getTranslatedMemberRole(
  groupId: string | undefined,
  user: User | null | undefined
) {
  if (user && groupId) {
    try {
      return await getMemberRole(user, groupId)
    } catch (e) {
      console.error(e)
    }
  }
  return null
}

export function useGroupFromSlug(groupSlug: string) {
  return useAsyncData(groupSlug, (slug) => getGroupFromSlug(slug))
}
export function useGroupFromId(groupId: string) {
  return useAsyncData(groupId, (id) => getGroup(id))
}

export function useGroupsFromIds(groupIds: string[]) {
  const groups = useAsyncData(groupIds, (ids) => Promise.all(ids.map(getGroup)))
  return groups ? groups.filter((g): g is Group => !!g) : groups
}

export function useListGroupsBySlug(groupSlugs: string[]) {
  return useAsyncData(groupSlugs, listGroupsBySlug)
}

export function useGroupsWhereUserHasRole(userId: string | undefined) {
  return useAsyncData(userId, getGroupsWhereUserHasRole)
}
