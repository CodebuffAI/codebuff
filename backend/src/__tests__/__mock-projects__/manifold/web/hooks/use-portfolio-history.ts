import { Period, getCutoff } from 'common/period'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { useEffect } from 'react'
import { getCurrentPortfolio } from 'common/supabase/portfolio-metrics'
import { db } from 'web/lib/supabase/db'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { api } from 'web/lib/api/api'

export type PeriodToSnapshots = {
  [time: number]: PortfolioSnapshot[]
}
export const usePortfolioHistory = (userId: string, period: Period) => {
  const cutoff = getCutoff(period)
  const [portfolioHistories, setPortfolioHistories] =
    usePersistentInMemoryState<PeriodToSnapshots>(
      {},
      `user-portfolio-history-${userId}`
    )

  useEffect(() => {
    if (portfolioHistories[cutoff]) return

    api('get-user-portfolio-history', { userId, period })
      .then((portfolioHistory) => {
        setPortfolioHistories((prev) => ({
          ...prev,
          [cutoff]: portfolioHistory,
        }))
      })
      .catch((e) => {
        console.error('Failed to get portfolio history', e)
      })
  }, [userId, setPortfolioHistories, cutoff])

  return portfolioHistories[cutoff] as PortfolioSnapshot[] | undefined
}

export const useCurrentPortfolio = (userId: string | null | undefined) => {
  const [portfolio, setPortfolio] = usePersistentInMemoryState<
    PortfolioSnapshot | null | undefined
  >(undefined, `current-portfolio-${userId}`)

  useEffect(() => {
    if (userId) {
      getCurrentPortfolio(userId, db).then(setPortfolio)
    }
  }, [userId])

  return portfolio
}
