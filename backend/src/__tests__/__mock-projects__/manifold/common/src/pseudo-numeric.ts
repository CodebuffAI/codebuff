import { Contract, PseudoNumericContract, StonkContract } from './contract'
import { formatLargeNumber, formatPercent } from './util/format'
import { getStonkPriceAtProb } from 'common/stonk'

export function formatNumericProbability(
  p: number,
  contract: PseudoNumericContract | StonkContract
) {
  const value = getMappedValue(contract, p)
  return formatLargeNumber(value)
}

export const getMappedValue = (contract: Contract, prob: number) => {
  if (
    contract.outcomeType !== 'PSEUDO_NUMERIC' &&
    contract.outcomeType !== 'STONK'
  )
    return prob

  if (contract.outcomeType === 'STONK')
    return getStonkPriceAtProb(contract as StonkContract, prob)

  const { min, max, isLogScale } = contract

  if (isLogScale) {
    const logValue = prob * Math.log10(max - min + 1)
    return 10 ** logValue + min - 1
  }

  return prob * (max - min) + min
}

export const getFormattedMappedValue = (contract: Contract, prob: number) => {
  const { outcomeType } = contract
  if (outcomeType !== 'PSEUDO_NUMERIC' && outcomeType !== 'STONK')
    return formatPercent(prob)

  const value = getMappedValue(contract, prob)
  return formatLargeNumber(value)
}

export const getPseudoProbability = (
  value: number,
  min: number,
  max: number,
  isLogScale = false
) => {
  if (value < min) return 0
  if (value > max) return 1

  if (isLogScale) {
    return Math.log10(value - min + 1) / Math.log10(max - min + 1)
  }

  return (value - min) / (max - min)
}
