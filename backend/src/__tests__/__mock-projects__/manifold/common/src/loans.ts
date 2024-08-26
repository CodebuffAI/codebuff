import { Dictionary, sumBy, minBy, groupBy } from 'lodash'
import { Bet } from './bet'
import { getProfitMetrics, getSimpleCpmmInvested } from './calculate'
import {
  Contract,
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from './contract'
import { filterDefined } from './util/array'
import { PortfolioMetrics } from 'common/portfolio-metrics'

export const LOAN_DAILY_RATE = 0.04

const calculateNewLoan = (investedValue: number, loanTotal: number) => {
  const netValue = investedValue - loanTotal
  return netValue * LOAN_DAILY_RATE
}

export const getUserLoanUpdates = (
  betsByContractId: { [contractId: string]: Bet[] },
  contractsById: { [contractId: string]: Contract }
) => {
  const updates = calculateLoanBetUpdates(betsByContractId, contractsById)
  return { updates, payout: sumBy(updates, (update) => update.newLoan) }
}

export const overLeveraged = (loanTotal: number, investmentValue: number) =>
  loanTotal / investmentValue >= 8

export const isUserEligibleForLoan = (
  portfolio: (PortfolioMetrics & { userId: string }) | undefined
) => {
  if (!portfolio) return true

  const { investmentValue, loanTotal } = portfolio
  return investmentValue > 0 && !overLeveraged(loanTotal ?? 0, investmentValue)
}

const calculateLoanBetUpdates = (
  betsByContractId: Dictionary<Bet[]>,
  contractsById: Dictionary<Contract>
) => {
  const contracts = filterDefined(
    Object.keys(betsByContractId).map((contractId) => contractsById[contractId])
  ).filter((c) => !c.isResolved)

  return contracts.flatMap((c) => {
    const bets = betsByContractId[c.id]
    if (c.mechanism === 'cpmm-1') {
      return getCpmmContractLoanUpdate(c, bets) ?? []
    } else if (c.mechanism === 'cpmm-multi-1') {
      const betsByAnswerId = groupBy(bets, (bet) => bet.answerId)
      return filterDefined(
        Object.entries(betsByAnswerId).map(([answerId, bets]) => {
          const answer = c.answers.find((a) => a.id === answerId)
          if (!answer) return undefined
          if (answer.resolution) return undefined
          return getCpmmContractLoanUpdate(c, bets)
        })
      )
    } else {
      // Unsupported contract / mechanism for loans.
      return []
    }
  })
}

const getCpmmContractLoanUpdate = (
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  bets: Bet[]
) => {
  const invested = getSimpleCpmmInvested(bets)
  const { payout: currentValue } = getProfitMetrics(contract, bets)
  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)

  const loanBasis = Math.min(invested, currentValue)
  const newLoan = calculateNewLoan(loanBasis, loanAmount)
  const oldestBet = minBy(bets, (bet) => bet.createdTime)
  if (!isFinite(newLoan) || newLoan <= 0 || !oldestBet) return undefined

  const loanTotal = (oldestBet.loanAmount ?? 0) + newLoan

  return {
    userId: oldestBet.userId,
    contractId: contract.id,
    betId: oldestBet.id,
    newLoan,
    loanTotal,
  }
}
