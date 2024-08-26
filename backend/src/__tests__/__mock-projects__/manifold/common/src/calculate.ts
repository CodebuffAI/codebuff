import {
  get,
  groupBy,
  mapValues,
  maxBy,
  partition,
  sortBy,
  sum,
  sumBy,
} from 'lodash'
import { Bet } from './bet'
import {
  calculateCpmmPurchase,
  getCpmmOutcomeProbabilityAfterBet,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  calculateFixedPayout,
  calculateFixedPayoutMulti,
} from './calculate-fixed-payouts'
import {
  BinaryContract,
  Contract,
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from './contract'
import { floatingEqual, floatingGreaterEqual } from './util/math'
import { ContractMetric } from 'common/contract-metric'
import { Answer } from './answer'
import { DAY_MS } from 'common/util/time'
import { computeInvestmentValueCustomProb } from 'common/calculate-metrics'

export function getProbability(
  contract: BinaryContract | PseudoNumericContract | StonkContract
) {
  return getCpmmProbability(contract.pool, contract.p)
}

export function getDisplayProbability(
  contract: BinaryContract | PseudoNumericContract | StonkContract
) {
  return contract.resolutionProbability ?? getProbability(contract)
}

export function getInitialProbability(
  contract: BinaryContract | PseudoNumericContract | StonkContract
) {
  if (contract.initialProbability) return contract.initialProbability

  return getCpmmProbability(contract.pool, contract.p)
}

export function getOutcomeProbability(contract: Contract, outcome: string) {
  const { mechanism } = contract
  switch (mechanism) {
    case 'cpmm-1':
      return outcome === 'YES'
        ? getCpmmProbability(contract.pool, contract.p)
        : 1 - getCpmmProbability(contract.pool, contract.p)
    case 'cpmm-multi-1':
      return 0
    default:
      throw new Error('getOutcomeProbability not implemented')
  }
}

export function getAnswerProbability(
  contract: MultiContract,
  answerId: string
) {
  const answer = contract.answers.find((a) => a.id === answerId)
  if (!answer) return 0

  const { poolYes, poolNo, resolution, resolutionProbability } = answer
  if (resolution) {
    if (resolution === 'MKT') return resolutionProbability ?? answer.prob
    if (resolution === 'YES') return 1
    if (resolution === 'NO') return 0
  }
  const pool = { YES: poolYes, NO: poolNo }
  return getCpmmProbability(pool, 0.5)
}

export function getInitialAnswerProbability(
  contract: MultiContract | CPMMNumericContract,
  answer: Answer
) {
  if (!contract.shouldAnswersSumToOne) {
    return 0.5
  } else {
    if (contract.addAnswersMode === 'DISABLED') {
      return 1 / contract.answers.length
    } else {
      const answers = contract.answers
      const initialTime = answers.find((a) => a.isOther)?.createdTime

      if (answer.createdTime === initialTime) {
        const numberOfInitialAnswers = sumBy(answers, (a) =>
          a.createdTime === initialTime ? 1 : 0
        )
        return 1 / numberOfInitialAnswers
      }
      return undefined
    }
  }
}

export function getOutcomeProbabilityAfterBet(
  contract: Contract,
  outcome: string,
  bet: number
) {
  const { mechanism } = contract
  switch (mechanism) {
    case 'cpmm-1':
      return getCpmmOutcomeProbabilityAfterBet(contract, outcome, bet)
    case 'cpmm-multi-1':
      return 0
    default:
      throw new Error('getOutcomeProbabilityAfterBet not implemented')
  }
}

export function calculateSharesBought(
  contract: Contract,
  outcome: string,
  amount: number
) {
  const { mechanism } = contract
  switch (mechanism) {
    case 'cpmm-1':
      return calculateCpmmPurchase(contract, amount, outcome).shares
    default:
      throw new Error('calculateSharesBought not implemented')
  }
}

export function calculatePayout(contract: Contract, bet: Bet, outcome: string) {
  const { mechanism } = contract
  return mechanism === 'cpmm-1'
    ? calculateFixedPayout(contract, bet, outcome)
    : mechanism === 'cpmm-multi-1'
    ? calculateFixedPayoutMulti(contract, bet, outcome)
    : bet?.amount ?? 0
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  const { resolution, mechanism } = contract
  if (!resolution) throw new Error('Contract not resolved')

  return mechanism === 'cpmm-1'
    ? calculateFixedPayout(contract, bet, resolution)
    : mechanism === 'cpmm-multi-1'
    ? calculateFixedPayoutMulti(contract, bet, resolution)
    : bet?.amount ?? 0
}

function getCpmmInvested(yourBets: Bet[]) {
  const totalShares: { [outcome: string]: number } = {}
  const totalSpent: { [outcome: string]: number } = {}

  const sharePurchases = sortBy(yourBets, [
    'createdTime',
    (bet) => (bet.isRedemption ? 1 : 0),
  ])

  for (const purchase of sharePurchases) {
    const { outcome, shares, amount } = purchase
    if (floatingEqual(shares, 0)) continue

    const spent = totalSpent[outcome] ?? 0
    const position = totalShares[outcome] ?? 0

    if (floatingGreaterEqual(amount, 0)) {
      totalShares[outcome] = position + shares
      totalSpent[outcome] = spent + amount
    } else {
      const averagePrice = floatingEqual(position, 0) ? 0 : spent / position
      totalShares[outcome] = position + shares
      totalSpent[outcome] = spent + averagePrice * shares
    }
  }

  return sum(Object.values(totalSpent))
}

export function getSimpleCpmmInvested(yourBets: Bet[]) {
  const total = sumBy(yourBets, (b) => b.amount)
  if (total < 0) return 0
  return total
}

export function getInvested(contract: Contract, yourBets: Bet[]) {
  const { mechanism } = contract
  if (mechanism === 'cpmm-1') return getCpmmInvested(yourBets)
  if (mechanism === 'cpmm-multi-1') {
    const betsByAnswerId = groupBy(yourBets, 'answerId')
    const investedByAnswerId = mapValues(betsByAnswerId, getCpmmInvested)
    return sum(Object.values(investedByAnswerId))
  }
  throw new Error('getInvested not implemented for mechanism ' + mechanism)
}

function getCpmmOrDpmProfit(
  contract: Contract,
  yourBets: Bet[],
  answer?: Answer
) {
  const resolution = answer?.resolution ?? contract.resolution

  let totalInvested = 0
  let payout = 0
  let saleValue = 0
  let redeemed = 0

  for (const bet of yourBets) {
    const { amount, isRedemption } = bet

    if (isRedemption) {
      redeemed += -1 * amount
    } else if (amount > 0) {
      totalInvested += amount
    } else {
      saleValue -= amount
    }

    payout += resolution
      ? calculatePayout(contract, bet, resolution)
      : calculatePayout(contract, bet, 'MKT')
  }

  const profit = payout + saleValue + redeemed - totalInvested
  const profitPercent = totalInvested === 0 ? 0 : (profit / totalInvested) * 100

  return {
    profit,
    profitPercent,
    totalInvested,
    payout,
  }
}

export function getProfitMetrics(contract: Contract, yourBets: Bet[]) {
  const { mechanism } = contract
  if (mechanism === 'cpmm-multi-1') {
    const betsByAnswerId = groupBy(yourBets, 'answerId')
    const profitMetricsPerAnswer = Object.entries(betsByAnswerId).map(
      ([answerId, bets]) => {
        const answer = contract.answers.find((a) => a.id === answerId)
        return getCpmmOrDpmProfit(contract, bets, answer)
      }
    )
    const profit = sumBy(profitMetricsPerAnswer, 'profit')
    const totalInvested = sumBy(profitMetricsPerAnswer, 'totalInvested')
    const profitPercent =
      totalInvested === 0 ? 0 : (profit / totalInvested) * 100
    const payout = sumBy(profitMetricsPerAnswer, 'payout')
    return {
      profit,
      profitPercent,
      totalInvested,
      payout,
    }
  }
  return getCpmmOrDpmProfit(contract, yourBets)
}

export function getCpmmShares(yourBets: Bet[]) {
  const totalShares: { [outcome: string]: number } = {}
  for (const bet of yourBets) {
    const { shares, outcome } = bet
    totalShares[outcome] = (totalShares[outcome] ?? 0) + shares
  }

  const hasShares = Object.values(totalShares).some(
    (shares) => !floatingEqual(shares, 0)
  )

  const { YES: yesShares, NO: noShares } = totalShares
  const hasYesShares = yesShares >= 1
  const hasNoShares = noShares >= 1

  return {
    totalShares,
    hasShares,
    hasYesShares,
    hasNoShares,
  }
}

export function getCpmmMultiShares(yourBets: Bet[]) {
  const betsByAnswerId = groupBy(yourBets, 'answerId')
  const sharesByAnswerId = mapValues(betsByAnswerId, (bets) =>
    getCpmmShares(bets)
  )

  const hasShares = Object.values(sharesByAnswerId).some(
    (shares) => shares.hasShares
  )

  return {
    hasShares,
    sharesByAnswerId,
  }
}

export const getContractBetMetrics = (
  contract: Contract,
  yourBets: Bet[],
  answerId?: string
) => {
  const { mechanism } = contract
  const isCpmmMulti = mechanism === 'cpmm-multi-1'
  const { profit, profitPercent, payout } = getProfitMetrics(contract, yourBets)
  const invested = getInvested(contract, yourBets)
  const loan = sumBy(yourBets, 'loanAmount')

  const { totalShares, hasShares, hasYesShares, hasNoShares } =
    getCpmmShares(yourBets)
  const lastBetTime = Math.max(...yourBets.map((b) => b.createdTime))
  const maxSharesOutcome = hasShares
    ? maxBy(Object.keys(totalShares), (outcome) => totalShares[outcome])
    : null

  return {
    invested,
    loan,
    payout,
    profit,
    profitPercent,
    totalShares,
    hasShares: isCpmmMulti ? getCpmmMultiShares(yourBets).hasShares : hasShares,
    hasYesShares,
    hasNoShares,
    maxSharesOutcome,
    lastBetTime,
    answerId: answerId ?? null,
  }
}
export const getContractBetMetricsPerAnswer = (
  contract: Contract,
  bets: Bet[],
  answers?: Answer[]
) => {
  const betsPerAnswer = groupBy(bets, 'answerId')
  const metricsPerAnswer = Object.values(
    mapValues(betsPerAnswer, (bets) => {
      const periods = ['day', 'week', 'month'] as const
      const answerId = bets[0].answerId
      const baseMetrics = getContractBetMetrics(contract, bets, answerId)
      let periodMetrics
      if (
        contract.mechanism === 'cpmm-1' ||
        contract.mechanism === 'cpmm-multi-1'
      ) {
        const answer = answers?.find((a) => a.id === answerId)
        const passedAnswer = !!answer
        if (contract.mechanism === 'cpmm-multi-1' && !passedAnswer) {
          console.log(
            `answer with id ${bets[0].answerId} not found, but is required for cpmm-multi-1 contract: ${contract.id}`
          )
        } else {
          periodMetrics = Object.fromEntries(
            periods.map((period) => [
              period,
              calculatePeriodProfit(contract, bets, period, answer),
            ])
          )
        }
      }
      return {
        ...baseMetrics,
        from: periodMetrics,
      } as ContractMetric
    })
  )

  // Calculate overall contract metrics with answerId:null bc it's nice to have
  if (contract.mechanism === 'cpmm-multi-1') {
    const baseFrom = metricsPerAnswer[0].from
    const calculateProfitPercent = (
      metrics: ContractMetric[],
      period: string
    ) => {
      const profit = sumBy(metrics, (m) => get(m, `from.${period}.profit`, 0))
      const invested = sumBy(metrics, (m) =>
        get(m, `from.${period}.invested`, 0)
      )
      return invested !== 0 ? 100 * (profit / invested) : 0
    }

    const baseMetric = getContractBetMetrics(contract, bets)
    const from = baseFrom
      ? mapValues(baseFrom, (periodMetrics, period) =>
          mapValues(periodMetrics, (_, key) =>
            key === 'profitPercent'
              ? calculateProfitPercent(metricsPerAnswer, period)
              : sumBy(metricsPerAnswer, (m) =>
                  get(m, `from.${period}.${key}`, 0)
                )
          )
        )
      : undefined
    metricsPerAnswer.push({
      ...baseMetric,
      // Overall period metrics = sum all the answers' period metrics
      from,
      answerId: null,
    } as ContractMetric)
  }
  return metricsPerAnswer
}

const calculatePeriodProfit = (
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  bets: Bet[],
  period: 'day' | 'week' | 'month',
  answer?: Answer
) => {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30
  const fromTime = Date.now() - days * DAY_MS
  const [previousBets, recentBets] = partition(
    bets,
    (b) => b.createdTime < fromTime
  )

  const { prob, probChanges } = answer ?? (contract as CPMMContract)
  const prevProb = prob - probChanges[period]

  const previousBetsValue = computeInvestmentValueCustomProb(
    previousBets,
    contract,
    prevProb
  )
  const currentBetsValue = computeInvestmentValueCustomProb(
    previousBets,
    contract,
    prob
  )

  const { profit: recentProfit, invested: recentInvested } =
    getContractBetMetrics(contract, recentBets)

  const profit = currentBetsValue - previousBetsValue + recentProfit
  const invested = previousBetsValue + recentInvested
  const profitPercent = invested === 0 ? 0 : 100 * (profit / invested)

  return {
    profit,
    profitPercent,
    invested,
    prevValue: previousBetsValue,
    value: currentBetsValue,
  }
}

export function getContractBetNullMetrics() {
  return {
    invested: 0,
    loan: 0,
    payout: 0,
    profit: 0,
    profitPercent: 0,
    totalShares: {} as { [outcome: string]: number },
    hasShares: false,
    hasYesShares: false,
    hasNoShares: false,
    maxSharesOutcome: null,
  } as ContractMetric
}
