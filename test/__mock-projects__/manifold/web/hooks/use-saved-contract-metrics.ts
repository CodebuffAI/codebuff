import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { useUser } from './use-user'
import { getUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect, useRef } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'
import { first, isEqual } from 'lodash'
import { useEvent } from 'web/hooks/use-event'

export const useSavedContractMetrics = (contract: Contract) => {
  const user = useUser()
  const lastBetTimeRef = useRef<number>(user?.lastBetTime ?? 0)

  useEffect(() => {
    lastBetTimeRef.current = user?.lastBetTime ?? 0
  }, [user?.lastBetTime])

  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric | undefined
  >(undefined, `contract-metrics-${contract.id}`)

  const callback = useEvent(async () => {
    if (!user?.id) return
    // Wait a small amount for the bet to replicate to supabase
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const retry = lastBetTimeRef.current > Date.now() - 5000 ? 5 : 0
    const queryAndSet = async (retries: number) =>
      getUserContractMetrics(user.id, contract.id, db).then((metrics) =>
        tryToGetDifferentMetricsThanSaved(
          savedMetrics,
          metrics,
          retries,
          setSavedMetrics,
          queryAndSet
        )
      )
    queryAndSet(retry)
  })

  useEffect(() => {
    callback()
  }, [user?.id, contract.id, contract.lastBetTime])

  return savedMetrics
}

const tryToGetDifferentMetricsThanSaved = (
  savedMetrics: ContractMetric | undefined,
  metrics: ContractMetric[] | undefined,
  retries: number,
  setSavedMetrics: (metric: ContractMetric | undefined) => void,
  queryAndSet: (retries: number) => void
) => {
  const metric = first(metrics)
  if (metric && !savedMetrics) setSavedMetrics(metric)
  else if (metric && savedMetrics && retries > 0) {
    // If we get the same metric as the saved one, retry to make sure we have the latest
    if (isEqual(metric, savedMetrics)) {
      queryAndSet(retries - 1)
    } else setSavedMetrics({ ...savedMetrics, ...metric })
  } else if (metric && savedMetrics && retries === 0) {
    setSavedMetrics({ ...savedMetrics, ...metric })
  } else if (retries > 0) queryAndSet(retries - 1)
}

export const useReadLocalContractMetrics = (contractId: string) => {
  const [savedMetrics] = usePersistentLocalState<ContractMetric | undefined>(
    undefined,
    `contract-metrics-${contractId}`
  )
  return savedMetrics
}
