import { db } from './db'
import { Contract } from 'common/contract'
import { sortBy } from 'lodash'
import { useCallback, useEffect, useState } from 'react'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'
import { APIParams } from 'common/api/schema'
import { unauthedApi } from 'common/util/api'
import { buildArray } from 'common/util/array'

export const useRecentlyBetOnContracts = (userId: string) => {
  const [savedContracts, setSavedContracts] = useState<Contract[]>()

  const loadMore = useCallback(async () => {
    const { contracts } = await getUserContractMetricsWithContracts(
      userId,
      db,
      10,
      savedContracts?.length ?? 0
    )
    setSavedContracts((prev) => (prev ? [...prev, ...contracts] : contracts))
    return contracts.length > 0
  }, [userId])
  useEffect(() => {
    // Don't fire multiple times on load so that we lose the proper count
    const timeout = setTimeout(loadMore, 1000)
    return () => clearTimeout(timeout)
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}

export async function getTotalBetCount(contractId: string) {
  const res = (await unauthedApi('bets', {
    contractId,
    count: true,
    filterRedemptions: true,
  })) as any as { count: number }[]
  return res[0].count
}

// gets random bets - 50,000 by default
export const getBetPoints = async (
  contractId: string,
  options?: APIParams<'bets'>
) => {
  const data = await unauthedApi('bets', {
    contractId,
    points: true,
    limit: 50000,
    ...options,
  })

  const sorted = sortBy(data, 'createdTime')

  if (sorted.length === 0) return []

  // we need to include previous prob for binary in case the prob shifted from something
  const includePrevProb = !!options?.afterTime && !sorted[0].answerId

  return buildArray(
    includePrevProb && {
      x: sorted[0].createdTime - 1,
      y: sorted[0].probBefore,
      answerId: sorted[0].answerId,
    },
    sorted.map((r) => ({
      x: r.createdTime,
      y: r.probAfter,
      answerId: r.answerId,
    }))
  )
}
