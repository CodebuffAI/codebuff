import { run } from 'common/supabase/utils'
import { useEffect } from 'react'
import { db } from 'web/lib/supabase/db'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useRepostsOnContract = (contractId: string) => {
  const [repostCount, setRepostCount] = usePersistentInMemoryState<
    number | undefined
  >(undefined, `contract-repost-count-on-${contractId}`)

  useEffect(() => {
    run(
      db
        .from('posts')
        .select('id', { count: 'exact' })
        .eq('contract_id', contractId)
    ).then(({ count }) => setRepostCount(count ?? 0))
  }, [contractId])

  return repostCount
}
