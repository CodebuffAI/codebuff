import { useUser } from 'web/hooks/use-user'
import { useEffect } from 'react'
import { call } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { getApiUrl } from 'common/api/utils'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { uniq } from 'lodash'
import { MARKET_VISIT_BONUS, MARKET_VISIT_BONUS_TOTAL } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { isVerified } from 'common/user'

/**
 * @deprecated market visit bonus no longer in use
 */
export const useRequestNewUserSignupBonus = (contractId: string) => {
  const user = useUser()

  const [newContractIdsVisited, setLastContractIdVisited] =
    usePersistentLocalState([contractId], 'newContractsVisited-' + user?.id)

  const remainingBonuses = useRemainingNewUserSignupBonuses()

  const requestNewUserSignupBonus = async () => {
    const numVisits = (user?.signupBonusPaid ?? 0) / MARKET_VISIT_BONUS
    const data = await call(getApiUrl('request-signup-bonus'), 'GET').catch(
      (e) => {
        console.log('error', e)
        return { bonus: 0 }
      }
    )
    const { bonus } = data

    if (bonus > 0) {
      toast.success(
        `+${formatMoney(bonus)} for visiting a new question! (${
          numVisits + bonus / MARKET_VISIT_BONUS
        }/${MARKET_VISIT_BONUS_TOTAL / MARKET_VISIT_BONUS})`,
        {
          duration: 5000,
        }
      )
    } else {
      console.log('no more bonus')
    }
  }

  useEffect(() => {
    if (
      newContractIdsVisited.includes(contractId) ||
      remainingBonuses <= 0 ||
      !user ||
      !isVerified(user) ||
      user.signupBonusPaid === undefined ||
      user.signupBonusPaid >= MARKET_VISIT_BONUS_TOTAL
    )
      return
    requestNewUserSignupBonus()
    setLastContractIdVisited(uniq([...newContractIdsVisited, contractId]))
  }, [contractId, user])
}

export const useRemainingNewUserSignupBonuses = () => {
  const user = useUser()
  if (!user) return 0
  if (user.signupBonusPaid === undefined) return 0
  return (MARKET_VISIT_BONUS_TOTAL - user.signupBonusPaid) / MARKET_VISIT_BONUS
}
