import { Contract } from 'common/contract'
import { getBountyRewardCount } from 'common/supabase/bounties'
import { useState, useEffect } from 'react'
import { db } from 'web/lib/supabase/db'

export const useBountyAwardCount = (contract: Contract) => {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    if (contract.outcomeType === 'BOUNTIED_QUESTION') {
      getBountyRewardCount(db, contract.id).then(setCount)
    }
  }, [contract.id])

  return count
}
