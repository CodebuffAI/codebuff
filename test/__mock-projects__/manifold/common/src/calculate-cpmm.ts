import { groupBy, mapValues, sumBy } from 'lodash'
import { LimitBet } from './bet'

import { Fees, getFeesSplit, getTakerFee, noFees } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import { computeFills } from './new-bet'
import { binarySearch } from './util/algos'
import { EPSILON, floatingEqual } from './util/math'
import {
  calculateCpmmMultiArbitrageSellNo,
  calculateCpmmMultiArbitrageSellYes,
} from './calculate-cpmm-arbitrage'
import { Answer } from './answer'
import { CPMMContract, CPMMMultiContract } from 'common/contract'

export type CpmmState = {
  pool: { [outcome: string]: number }
  p: number
  collectedFees: Fees
}

export function getCpmmProbability(
  pool: { [outcome: string]: number },
  p: number
) {
  const { YES, NO } = pool
  return (p * NO) / ((1 - p) * YES + p * NO)
}

export function getCpmmProbabilityAfterBetBeforeFees(
  state: CpmmState,
  outcome: string,
  bet: number
) {
  const { pool, p } = state
  const shares = calculateCpmmShares(pool, p, bet, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + bet, n + bet]
      : [y + bet, n - shares + bet]

  return getCpmmProbability({ YES: newY, NO: newN }, p)
}

export function getCpmmOutcomeProbabilityAfterBet(
  state: CpmmState,
  outcome: string,
  bet: number
) {
  const { newPool } = calculateCpmmPurchase(state, bet, outcome)
  const p = getCpmmProbability(newPool, state.p)
  return outcome === 'NO' ? 1 - p : p
}

// before liquidity fee
function calculateCpmmShares(
  pool: {
    [outcome: string]: number
  },
  p: number,
  betAmount: number,
  betChoice: string
) {
  if (betAmount === 0) return 0

  const { YES: y, NO: n } = pool
  const k = y ** p * n ** (1 - p)

  return betChoice === 'YES'
    ? // https://www.wolframalpha.com/input?i=%28y%2Bb-s%29%5E%28p%29*%28n%2Bb%29%5E%281-p%29+%3D+k%2C+solve+s
      y + betAmount - (k * (betAmount + n) ** (p - 1)) ** (1 / p)
    : n + betAmount - (k * (betAmount + y) ** -p) ** (1 / (1 - p))
}

export function getCpmmFees(
  state: CpmmState,
  betAmount: number,
  outcome: string
) {
  // Do a few iterations toward average probability of the bet minus fees.
  // Charging fees means the bet amount is lower and the average probability moves slightly less far.
  let fee = 0
  for (let i = 0; i < 10; i++) {
    const betAmountAfterFee = betAmount - fee
    const shares = calculateCpmmShares(
      state.pool,
      state.p,
      betAmountAfterFee,
      outcome
    )
    const averageProb = betAmountAfterFee / shares
    fee = getTakerFee(shares, averageProb)
  }

  const totalFees = betAmount === 0 ? 0 : fee
  const fees = getFeesSplit(totalFees, state.collectedFees)

  const remainingBet = betAmount - totalFees

  return { remainingBet, totalFees, fees }
}

export function calculateCpmmSharesAfterFee(
  state: CpmmState,
  bet: number,
  outcome: string
) {
  const { pool, p } = state
  const { remainingBet } = getCpmmFees(state, bet, outcome)

  return calculateCpmmShares(pool, p, remainingBet, outcome)
}

export function calculateCpmmPurchase(
  state: CpmmState,
  bet: number,
  outcome: string,
  freeFees?: boolean
) {
  const { pool, p } = state
  const { remainingBet, fees } = freeFees
    ? {
        remainingBet: bet,
        fees: noFees,
      }
    : getCpmmFees(state, bet, outcome)

  const shares = calculateCpmmShares(pool, p, remainingBet, outcome)
  const { YES: y, NO: n } = pool

  const { liquidityFee: fee } = fees

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + remainingBet + fee, n + remainingBet + fee]
      : [y + remainingBet + fee, n - shares + remainingBet + fee]

  const postBetPool = { YES: newY, NO: newN }

  const { newPool, newP } = addCpmmLiquidity(postBetPool, p, fee)

  return { shares, newPool, newP, fees }
}

export function calculateCpmmAmountToProb(
  state: CpmmState,
  prob: number,
  outcome: 'YES' | 'NO'
) {
  if (prob <= 0 || prob >= 1 || isNaN(prob)) return Infinity
  if (outcome === 'NO') prob = 1 - prob

  const { pool, p } = state
  const { YES: y, NO: n } = pool
  const k = y ** p * n ** (1 - p)
  return outcome === 'YES'
    ? // https://www.wolframalpha.com/input?i=-1+%2B+t+-+((-1+%2B+p)+t+(k%2F(n+%2B+b))^(1%2Fp))%2Fp+solve+b
      ((p * (prob - 1)) / ((p - 1) * prob)) ** -p *
        (k - n * ((p * (prob - 1)) / ((p - 1) * prob)) ** p)
    : (((1 - p) * (prob - 1)) / (-p * prob)) ** (p - 1) *
        (k - y * (((1 - p) * (prob - 1)) / (-p * prob)) ** (1 - p))
}

export function calculateCpmmAmountToProbIncludingFees(
  state: CpmmState,
  prob: number,
  outcome: 'YES' | 'NO'
) {
  const amount = calculateCpmmAmountToProb(state, prob, outcome)
  const shares = calculateCpmmShares(state.pool, state.p, amount, outcome)
  const averageProb = amount / shares
  const fees = getTakerFee(shares, averageProb)
  return amount + fees
}

export function calculateCpmmAmountToBuySharesFixedP(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO'
) {
  if (!floatingEqual(state.p, 0.5)) {
    throw new Error(
      'calculateAmountToBuySharesFixedP only works for p = 0.5, got ' + state.p
    )
  }

  const { YES: y, NO: n } = state.pool
  if (outcome === 'YES') {
    // https://www.wolframalpha.com/input?i=%28y%2Bb-s%29%5E0.5+*+%28n%2Bb%29%5E0.5+%3D+y+%5E+0.5+*+n+%5E+0.5%2C+solve+b
    return (
      (shares - y - n + Math.sqrt(4 * n * shares + (y + n - shares) ** 2)) / 2
    )
  }
  return (
    (shares - y - n + Math.sqrt(4 * y * shares + (y + n - shares) ** 2)) / 2
  )
}

// Faster version assuming p = 0.5
export function calculateAmountToBuySharesFixedP(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  freeFees?: boolean
) {
  const { takers } = computeFills(
    state,
    outcome,
    // First, bet more than required to get shares.
    shares,
    undefined,
    unfilledBets,
    balanceByUserId,
    undefined,
    freeFees
  )

  let currShares = 0
  let currAmount = 0
  for (const fill of takers) {
    const { amount: fillAmount, shares: fillShares, matchedBetId } = fill

    if (floatingEqual(currShares + fillShares, shares)) {
      return currAmount + fillAmount
    }
    if (currShares + fillShares > shares) {
      // This is first fill that goes over the required shares.
      if (matchedBetId) {
        // Match a portion of the fill to get the exact shares.
        const remainingShares = shares - currShares
        const remainingAmount = fillAmount * (remainingShares / fillShares)
        return currAmount + remainingAmount
      }
      // Last fill was from AMM. Break to compute the cpmmState at this point.
      break
    }

    currShares += fillShares
    currAmount += fillAmount
  }

  const remaningShares = shares - currShares

  // Recompute up to currAmount to get the current cpmmState.
  const { cpmmState } = computeFills(
    state,
    outcome,
    currAmount,
    undefined,
    unfilledBets,
    balanceByUserId,
    undefined,
    freeFees
  )
  const fillAmount = calculateCpmmAmountToBuySharesFixedP(
    cpmmState,
    remaningShares,
    outcome
  )
  const fillAmountFees = freeFees
    ? 0
    : getTakerFee(remaningShares, fillAmount / remaningShares)
  return currAmount + fillAmount + fillAmountFees
}

export function calculateCpmmMultiSumsToOneSale(
  answers: Answer[],
  answerToSell: Answer,
  shares: number,
  outcome: 'YES' | 'NO',
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  if (Math.round(shares) < 0) {
    throw new Error('Cannot sell non-positive shares')
  }

  const { newBetResult, otherBetResults } =
    outcome === 'YES'
      ? calculateCpmmMultiArbitrageSellYes(
          answers,
          answerToSell,
          shares,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )
      : calculateCpmmMultiArbitrageSellNo(
          answers,
          answerToSell,
          shares,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )

  const buyAmount = sumBy(newBetResult.takers, (taker) => taker.amount)
  // Transform buys of opposite outcome into sells.
  const saleTakers = newBetResult.takers.map((taker) => ({
    ...taker,
    // You bought opposite shares, which combine with existing shares, removing them.
    shares: -taker.shares,
    // Opposite shares combine with shares you are selling for Ṁ of shares.
    // You paid taker.amount for the opposite shares.
    // Take the negative because this is money you gain.
    amount: -(taker.shares - taker.amount),
    isSale: true,
  }))

  const saleValue = -sumBy(saleTakers, (taker) => taker.amount)

  const transformedNewBetResult = {
    ...newBetResult,
    takers: saleTakers,
    outcome,
  }

  return {
    saleValue,
    buyAmount,
    newBetResult: transformedNewBetResult,
    otherBetResults,
  }
}

export function calculateAmountToBuyShares(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const prob = getCpmmProbability(state.pool, state.p)
  const minAmount = shares * (outcome === 'YES' ? prob : 1 - prob)

  // Search for amount between bounds.
  // Min share price is based on current probability, and max is Ṁ1 each.
  return binarySearch(minAmount, shares, (amount) => {
    const { takers } = computeFills(
      state,
      outcome,
      amount,
      undefined,
      unfilledBets,
      balanceByUserId
    )

    const totalShares = sumBy(takers, (taker) => taker.shares)
    return totalShares - shares
  })
}

export function calculateCpmmAmountToBuyShares(
  contract: CPMMContract | CPMMMultiContract,
  shares: number,
  outcome: 'YES' | 'NO',
  allUnfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  answer?: Answer
) {
  const startCpmmState =
    contract.mechanism === 'cpmm-1'
      ? contract
      : {
          pool: { YES: answer!.poolYes, NO: answer!.poolNo },
          p: 0.5,
          collectedFees: contract.collectedFees,
        }

  const unfilledBets = answer?.id
    ? allUnfilledBets.filter((b) => b.answerId === answer.id)
    : allUnfilledBets

  if (contract.mechanism === 'cpmm-1') {
    return calculateAmountToBuyShares(
      startCpmmState,
      shares,
      outcome,
      unfilledBets,
      balanceByUserId
    )
  } else if (contract.mechanism === 'cpmm-multi-1') {
    return calculateAmountToBuySharesFixedP(
      startCpmmState,
      shares,
      outcome,
      unfilledBets,
      balanceByUserId
    )
  } else {
    throw new Error('Only works for cpmm-1 and cpmm-multi-1')
  }
}

export function calculateCpmmSale(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  if (Math.round(shares) < 0) {
    throw new Error('Cannot sell non-positive shares')
  }

  const oppositeOutcome = outcome === 'YES' ? 'NO' : 'YES'
  const buyAmount = calculateAmountToBuyShares(
    state,
    shares,
    oppositeOutcome,
    unfilledBets,
    balanceByUserId
  )

  const { cpmmState, makers, takers, totalFees, ordersToCancel } = computeFills(
    state,
    oppositeOutcome,
    buyAmount,
    undefined,
    unfilledBets,
    balanceByUserId
  )

  // Transform buys of opposite outcome into sells.
  const saleTakers = takers.map((taker) => ({
    ...taker,
    // You bought opposite shares, which combine with existing shares, removing them.
    shares: -taker.shares,
    // Opposite shares combine with shares you are selling for Ṁ of shares.
    // You paid taker.amount for the opposite shares.
    // Take the negative because this is money you gain.
    amount: -(taker.shares - taker.amount),
    isSale: true,
  }))

  const saleValue = -sumBy(saleTakers, (taker) => taker.amount)

  return {
    saleValue,
    buyAmount,
    cpmmState,
    fees: totalFees,
    makers,
    takers: saleTakers,
    ordersToCancel,
  }
}

export function getCpmmProbabilityAfterSale(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const { cpmmState } = calculateCpmmSale(
    state,
    shares,
    outcome,
    unfilledBets,
    balanceByUserId
  )
  return getCpmmProbability(cpmmState.pool, cpmmState.p)
}

export function getCpmmLiquidity(
  pool: { [outcome: string]: number },
  p: number
) {
  const { YES, NO } = pool
  return YES ** p * NO ** (1 - p)
}

export function getMultiCpmmLiquidity(pool: { YES: number; NO: number }) {
  return getCpmmLiquidity(pool, 0.5)
}

export function addCpmmLiquidity(
  pool: { [outcome: string]: number },
  p: number,
  amount: number
) {
  const prob = getCpmmProbability(pool, p)

  //https://www.wolframalpha.com/input?i=p%28n%2Bb%29%2F%28%281-p%29%28y%2Bb%29%2Bp%28n%2Bb%29%29%3Dq%2C+solve+p
  const { YES: y, NO: n } = pool
  const numerator = prob * (amount + y)
  const denominator = amount - n * (prob - 1) + prob * y
  const newP = numerator / denominator

  const newPool = { YES: y + amount, NO: n + amount }

  const oldLiquidity = getCpmmLiquidity(pool, newP)
  const newLiquidity = getCpmmLiquidity(newPool, newP)
  const liquidity = newLiquidity - oldLiquidity

  return { newPool, liquidity, newP }
}

export function addCpmmLiquidityFixedP(
  pool: { YES: number; NO: number },
  amount: number
) {
  const prob = getCpmmProbability(pool, 0.5)
  const newPool = { ...pool }
  const sharesThrownAway = { YES: 0, NO: 0 }

  // Throws away some shares so that prob is maintained.
  if (prob < 0.5) {
    newPool.YES += amount
    newPool.NO += (prob / (1 - prob)) * amount
    sharesThrownAway.NO = amount - (prob / (1 - prob)) * amount
  } else {
    newPool.NO += amount
    newPool.YES += ((1 - prob) / prob) * amount
    sharesThrownAway.YES = amount - ((1 - prob) / prob) * amount
  }

  const oldLiquidity = getMultiCpmmLiquidity(pool)
  const newLiquidity = getMultiCpmmLiquidity(newPool)
  const liquidity = newLiquidity - oldLiquidity

  return { newPool, liquidity, sharesThrownAway }
}

export function addCpmmMultiLiquidityToAnswersIndependently(
  pools: { [answerId: string]: { YES: number; NO: number } },
  amount: number
) {
  const amountPerAnswer = amount / Object.keys(pools).length
  return mapValues(
    pools,
    (pool) => addCpmmLiquidityFixedP(pool, amountPerAnswer).newPool
  )
}

export function addCpmmMultiLiquidityAnswersSumToOne(
  pools: { [answerId: string]: { YES: number; NO: number } },
  amount: number
) {
  const answerIds = Object.keys(pools)
  const numAnswers = answerIds.length

  const newPools = { ...pools }

  let amountRemaining = amount
  while (amountRemaining > EPSILON) {
    const yesSharesThrownAway: { [answerId: string]: number } =
      Object.fromEntries(answerIds.map((answerId) => [answerId, 0]))

    for (const [answerId, pool] of Object.entries(newPools)) {
      const { newPool, sharesThrownAway } = addCpmmLiquidityFixedP(
        pool,
        amountRemaining / numAnswers
      )
      newPools[answerId] = newPool

      yesSharesThrownAway[answerId] += sharesThrownAway.YES
      const otherAnswerIds = answerIds.filter((id) => id !== answerId)
      for (const otherAnswerId of otherAnswerIds) {
        // Convert NO shares into YES shares for each other answer.
        yesSharesThrownAway[otherAnswerId] += sharesThrownAway.NO
      }
    }

    const minSharesThrownAway = Math.min(...Object.values(yesSharesThrownAway))
    amountRemaining = minSharesThrownAway
  }
  return newPools
}

export function getCpmmLiquidityPoolWeights(liquidities: LiquidityProvision[]) {
  const userAmounts = groupBy(liquidities, (w) => w.userId)
  const totalAmount = sumBy(liquidities, (w) => w.amount)

  return mapValues(
    userAmounts,
    (amounts) => sumBy(amounts, (w) => w.amount) / totalAmount
  )
}

const getK = (pool: { [outcome: string]: number }) => {
  const values = Object.values(pool)
  return sumBy(values, Math.log)
}

export const getLiquidity = (pool: { [outcome: string]: number }) => {
  return Math.exp(getK(pool) / Object.keys(pool).length)
}

export function getUserLiquidityShares(
  userId: string,
  pool: { [outcome: string]: number },
  liquidities: LiquidityProvision[]
) {
  const weights = getCpmmLiquidityPoolWeights(liquidities)
  const userWeight = weights[userId] ?? 0

  return mapValues(pool, (shares) => userWeight * shares)
}
