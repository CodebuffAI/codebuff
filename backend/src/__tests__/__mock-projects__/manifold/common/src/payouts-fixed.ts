import { sumBy } from 'lodash'
import { Bet } from './bet'
import { getCpmmLiquidityPoolWeights } from './calculate-cpmm'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { Answer } from './answer'

export const getFixedCancelPayouts = (
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const liquidityPayouts = liquidities.map((lp) => ({
    userId: lp.userId,
    payout: lp.amount,
  }))

  const payouts = bets.map((bet) => ({
    userId: bet.userId,
    // We keep the platform fee.
    payout: bet.amount - bet.fees.platformFee,
  }))

  // Creator pays back all creator fees for N/A resolution.
  const creatorFees = sumBy(bets, (b) => b.fees.creatorFee)
  payouts.push({
    userId: contract.creatorId,
    payout: -creatorFees,
  })

  return { payouts, liquidityPayouts }
}

export const getStandardFixedPayouts = (
  outcome: string,
  contract:
    | CPMMContract
    | (CPMMMultiContract & { shouldAnswersSumToOne: false }),
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const payouts = winningBets.map(({ userId, shares }) => ({
    userId,
    payout: shares,
  }))

  const liquidityPayouts =
    contract.mechanism === 'cpmm-1'
      ? getLiquidityPoolPayouts(contract, outcome, liquidities)
      : []

  return { payouts, liquidityPayouts }
}

export const getMultiFixedPayouts = (
  answers: Answer[],
  resolutions: { [answerId: string]: number },
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const payouts = bets
    .map(({ userId, shares, answerId, outcome }) => {
      const weight = answerId ? resolutions[answerId] ?? 0 : 0
      const outcomeWeight = outcome === 'YES' ? weight : 1 - weight
      const payout = shares * outcomeWeight
      return {
        userId,
        payout,
      }
    })
    .filter(({ payout }) => payout !== 0)

  const liquidityPayouts = getMultiLiquidityPoolPayouts(
    answers,
    resolutions,
    liquidities
  )
  return { payouts, liquidityPayouts }
}

export const getIndependentMultiYesNoPayouts = (
  answer: Answer,
  outcome: string,
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const payouts = winningBets.map(({ userId, shares }) => ({
    userId,
    payout: shares,
  }))

  const resolution = outcome === 'YES' ? 1 : 0
  const liquidityPayouts = getIndependentMultiLiquidityPoolPayouts(
    answer,
    resolution,
    liquidities
  )

  return { payouts, liquidityPayouts }
}

export const getLiquidityPoolPayouts = (
  contract: CPMMContract,
  outcome: string,
  liquidities: LiquidityProvision[]
) => {
  const { pool, subsidyPool } = contract
  const finalPool = pool[outcome] + (subsidyPool ?? 0)
  if (finalPool < 1e-3) return []

  const weights = getCpmmLiquidityPoolWeights(liquidities)

  return Object.entries(weights).map(([providerId, weight]) => ({
    userId: providerId,
    payout: weight * finalPool,
  }))
}

export const getIndependentMultiLiquidityPoolPayouts = (
  answer: Answer,
  resolution: number,
  liquidities: LiquidityProvision[]
) => {
  const payout = resolution * answer.poolYes + (1 - resolution) * answer.poolNo
  const weightsByUser = getCpmmLiquidityPoolWeights(liquidities)
  return Object.entries(weightsByUser)
    .map(([userId, weight]) => ({
      userId,
      payout: weight * payout,
    }))
    .filter(({ payout }) => payout >= 1e-3)
}

export const getMultiLiquidityPoolPayouts = (
  answers: Answer[],
  resolutions: { [answerId: string]: number },
  liquidities: LiquidityProvision[]
) => {
  const totalPayout = sumBy(answers, (answer) => {
    const weight = resolutions[answer.id] ?? 0
    const { poolYes, poolNo } = answer
    return weight * poolYes + (1 - weight) * poolNo
  })
  const weightsByUser = getCpmmLiquidityPoolWeights(liquidities)
  return Object.entries(weightsByUser)
    .map(([userId, weight]) => ({
      userId,
      payout: weight * totalPayout,
    }))
    .filter(({ payout }) => payout >= 1e-3)
}

export const getMktFixedPayouts = (
  contract:
    | CPMMContract
    | (CPMMMultiContract & { shouldAnswersSumToOne: false }),
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  const outcomeProbs = {
    YES: resolutionProbability,
    NO: 1 - resolutionProbability,
  }

  const payouts = bets.map(({ userId, outcome, shares }) => {
    const p = outcomeProbs[outcome as 'YES' | 'NO'] ?? 0
    const payout = p * shares
    return { userId, payout }
  })

  const liquidityPayouts =
    contract.mechanism === 'cpmm-1'
      ? getLiquidityPoolProbPayouts(contract, outcomeProbs, liquidities)
      : []

  return { payouts, liquidityPayouts }
}

export const getIndependentMultiMktPayouts = (
  answer: Answer,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  const outcomeProbs = {
    YES: resolutionProbability,
    NO: 1 - resolutionProbability,
  }

  const payouts = bets.map(({ userId, outcome, shares }) => {
    const p = outcomeProbs[outcome as 'YES' | 'NO'] ?? 0
    const payout = p * shares
    return { userId, payout }
  })

  const liquidityPayouts = getIndependentMultiLiquidityPoolPayouts(
    answer,
    resolutionProbability,
    liquidities
  )

  return { payouts, liquidityPayouts }
}

export const getLiquidityPoolProbPayouts = (
  contract: CPMMContract,
  outcomeProbs: { [outcome: string]: number },
  liquidities: LiquidityProvision[]
) => {
  const { pool, subsidyPool } = contract

  const weightedPool = sumBy(
    Object.keys(pool),
    (o) => pool[o] * (outcomeProbs[o] ?? 0)
  )
  const finalPool = weightedPool + (subsidyPool ?? 0)
  if (finalPool < 1e-3) return []

  const weights = getCpmmLiquidityPoolWeights(liquidities)

  return Object.entries(weights).map(([providerId, weight]) => ({
    userId: providerId,
    payout: weight * finalPool,
  }))
}
