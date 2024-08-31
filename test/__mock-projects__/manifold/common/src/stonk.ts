import { StonkContract } from 'common/contract'

export const STONK_YES = 'BUY'
export const STONK_NO = 'SHORT'
export const STONK_INITIAL_PROB = 50

const DEFAULT_STONK_MULTIPLIER = 500
// Doesn't seem necessary to show the max as *stocks* should be unbounded
export const getStonkPriceMax = () => {
  return Math.round(getStonkPriceAtProb({} as StonkContract, 1))
}

// TODO: remove unused contract param if we ever settle on a pricing mechanism
export const getStonkPriceAtProb = (contract: StonkContract, prob: number) => {
  const cappedProb = Math.min(Math.max(prob, 0.0001), 0.9999)
  const logTerm = Math.log(cappedProb / (1 - cappedProb))
  const maxTerm = Math.max(logTerm, cappedProb)
  const stonkPrice = maxTerm * DEFAULT_STONK_MULTIPLIER
  return stonkPrice
}

export const getStonkDisplayShares = (
  contract: StonkContract,
  shares: number,
  precision?: number
) => {
  if (precision !== undefined) {
    return Number(
      (Math.floor(shares) / getStonkPriceAtProb(contract, 1)).toPrecision(2)
    )
  }
  return Number(
    (Math.floor(shares) / getStonkPriceAtProb(contract, 1)).toFixed(5)
  )
}

export const getSharesFromStonkShares = (
  contract: StonkContract,
  displayShares: number,
  totalShares: number
) => {
  const stonkShares = displayShares * getStonkPriceAtProb(contract, 1)
  if (Math.abs(totalShares - stonkShares) < 1) {
    return totalShares
  }
  return stonkShares
}
