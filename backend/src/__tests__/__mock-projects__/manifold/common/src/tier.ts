import { MarketContract } from './contract'
import { getAnte, getTieredCost } from './economy'

// Array of tiers in order
export const tiers = ['play', 'basic', 'plus', 'premium', 'crystal'] as const

export type BinaryDigit = '0' | '1'

export type TierParamsType =
  `${BinaryDigit}${BinaryDigit}${BinaryDigit}${BinaryDigit}${BinaryDigit}`

// Derive the MarketTierType from the array
export type MarketTierType = (typeof tiers)[number]

export function getTierFromLiquidity(
  contract: MarketContract,
  liquidity: number
): MarketTierType {
  const { outcomeType } = contract

  let numAnswers = undefined
  if ('answers' in contract) {
    numAnswers = contract.answers.length
  }

  const ante = getAnte(outcomeType, numAnswers)

  // Iterate through the tiers from highest to lowest
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i]
    const tierLiquidity = getTieredCost(ante, tier, outcomeType)
    // Return the first tier where the liquidity is greater or equal to the tier's requirement
    if (liquidity >= tierLiquidity) {
      return tier as MarketTierType
    }
  }
  // Default to the lowest tier if none of the conditions are met
  return 'play'
}
