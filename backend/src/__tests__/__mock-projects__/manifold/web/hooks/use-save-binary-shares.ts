import {
  BinaryContract,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Bet } from 'common/bet'
import { partition, sumBy } from 'lodash'
import { safeLocalStorage } from 'web/lib/util/local'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useStateCheckEquality } from './use-state-check-equality'

export const useSaveBinaryShares = (
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract,
  userBets: Bet[] | undefined
) => {
  const [savedShares, setSavedShares] = useStateCheckEquality({
    yesShares: 0,
    noShares: 0,
  })
  const mcAnswer = getMainBinaryMCAnswer(contract)

  const [yesBets, noBets] = partition(userBets ?? [], (bet) =>
    !mcAnswer
      ? bet.outcome === 'YES'
      : (bet.answerId === mcAnswer.id && bet.outcome === 'YES') ||
        (bet.answerId !== mcAnswer.id && bet.outcome === 'NO')
  )
  const [yesShares, noShares] = userBets
    ? [sumBy(yesBets, (bet) => bet.shares), sumBy(noBets, (bet) => bet.shares)]
    : [savedShares.yesShares, savedShares.noShares]

  useEffectCheckEquality(() => {
    // Read shares from local storage.
    const savedShares = safeLocalStorage?.getItem(`${contract.id}-shares`)
    if (savedShares) {
      setSavedShares(JSON.parse(savedShares))
    }

    if (userBets?.length) {
      // Save shares to local storage.
      const sharesData = JSON.stringify({ yesShares, noShares })
      safeLocalStorage?.setItem(`${contract.id}-shares`, sharesData)
    }
  }, [contract.id, userBets, noShares, yesShares])

  const hasYesShares = yesShares >= 1
  const hasNoShares = noShares >= 1

  const sharesOutcome = hasYesShares
    ? ('YES' as const)
    : hasNoShares
    ? ('NO' as const)
    : undefined
  const shares =
    sharesOutcome === 'YES' ? yesShares : sharesOutcome === 'NO' ? noShares : 0

  return {
    yesShares,
    noShares,
    shares,
    sharesOutcome,
    hasYesShares,
    hasNoShares,
  }
}
