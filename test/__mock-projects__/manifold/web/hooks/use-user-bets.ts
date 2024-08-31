import { useContractBets } from './use-bets'
import { removeUndefinedProps } from 'common/util/object'

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string
) => {
  return useContractBets(
    contractId,
    removeUndefinedProps({
      userId,
      enabled: !!userId,
    })
  )
}
