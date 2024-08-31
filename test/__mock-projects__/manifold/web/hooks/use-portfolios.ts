import { Portfolio } from 'common/portfolio'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useEffect } from 'react'
import { getAllPortfolios } from 'web/lib/supabase/portfolio'

export const usePortfolios = () => {
  const [portfolios, setPortfolios] = usePersistentInMemoryState<Portfolio[]>(
    [],
    'all-portfolios'
  )

  useEffect(() => {
    getAllPortfolios().then(setPortfolios)
  }, [])

  return portfolios
}
