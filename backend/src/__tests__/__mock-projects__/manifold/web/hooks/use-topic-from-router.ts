import { useEffect } from 'react'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Group } from 'common/group'

export const useTopicFromRouter = (topicSlug: string | undefined) => {
  const [categoryFromRouter, setCategoryFromRouter] =
    usePersistentInMemoryState<Group | undefined>(
      undefined,
      'categoryFromRouter'
    )
  useEffect(() => {
    if (topicSlug)
      getGroupFromSlug(topicSlug).then((g) =>
        setCategoryFromRouter(g ?? undefined)
      )
    else setCategoryFromRouter(undefined)
  }, [topicSlug])
  return categoryFromRouter
}
