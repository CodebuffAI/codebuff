import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { isUserEligibleForLoan } from 'common/loans'

export const useIsEligibleForLoans = (userId: string | null | undefined) => {
  const latestPortfolio = useCurrentPortfolio(userId)
  const isEligible = isUserEligibleForLoan(
    latestPortfolio && userId ? { ...latestPortfolio, userId } : undefined
  )
  return { latestPortfolio, isEligible }
}
