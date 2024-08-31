import { useEffect } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { Group } from 'common/group'
import { convertGroup } from 'common/supabase/groups'
import { useMemberGroupIdsOnLoad } from 'web/hooks/use-group-supabase'
import { User } from 'common/user'
import { RATING_GROUP_SLUGS } from 'common/envs/constants'

export function useTrendingTopics(limit: number, persistKey?: string) {
  const [results, setResults] = usePersistentLocalState<Group[] | undefined>(
    undefined,
    persistKey ?? 'trending-topics'
  )

  const getGroups = async () => {
    const { data } = await run(
      db
        .from('groups')
        .select()
        .not('slug', 'in', `(${RATING_GROUP_SLUGS.join(',')})`)
        .order('importance_score', { ascending: false })
        .limit(limit)
    )
    if (data) setResults(data.map((group) => convertGroup(group)))
  }
  useEffect(() => {
    getGroups()
  }, [])

  return results
}

export function useUserTrendingTopics(
  user: User | undefined | null,
  limit: number
) {
  const [results, setResults] = usePersistentLocalState<Group[] | undefined>(
    undefined,
    'trending-topics-' + (user?.id ?? '')
  )
  const yourGroupIdsInMemory = useMemberGroupIdsOnLoad(user?.id)

  const getGroups = async (ids: string[]) => {
    const { data } = await run(
      db
        .from('groups')
        .select()
        .in('id', ids)
        .order('importance_score', { ascending: false })
        .gt('importance_score', 0.3)
        .limit(limit)
    )
    if (data) setResults(data.map((group) => convertGroup(group)))
  }
  useEffect(() => {
    if (yourGroupIdsInMemory?.length && user) getGroups(yourGroupIdsInMemory)
  }, [yourGroupIdsInMemory?.length])

  return results
}
