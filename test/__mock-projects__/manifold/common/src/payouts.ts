import { sumBy, groupBy, mapValues } from 'lodash'

import { Bet } from './bet'
import { Contract, CPMMContract, CPMMMultiContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import {
  getFixedCancelPayouts,
  getIndependentMultiMktPayouts,
  getMktFixedPayouts,
  getMultiFixedPayouts,
  getStandardFixedPayouts,
  getIndependentMultiYesNoPayouts,
} from './payouts-fixed'
import { getProbability } from './calculate'
import { Answer } from './answer'

export type Payout = {
  userId: string
  payout: number
}

export const getLoanPayouts = (bets: Bet[]): Payout[] => {
  const betsWithLoans = bets.filter((bet) => bet.loanAmount)
  const betsByUser = groupBy(betsWithLoans, (bet) => bet.userId)
  const loansByUser = mapValues(betsByUser, (bets) =>
    sumBy(bets, (bet) => -(bet.loanAmount ?? 0))
  )
  return Object.entries(loansByUser).map(([userId, payout]) => ({
    userId,
    payout,
  }))
}

export const groupPayoutsByUser = (payouts: Payout[]) => {
  const groups = groupBy(payouts, (payout) => payout.userId)
  return mapValues(groups, (group) => sumBy(group, (g) => g.payout))
}

export type PayoutInfo = {
  payouts: Payout[]
  liquidityPayouts: Payout[]
}

export const getPayouts = (
  outcome: string | undefined,
  contract: Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutions?: {
    [outcome: string]: number
  },
  resolutionProbability?: number,
  answer?: Answer | null | undefined,
  allAnswers?: Answer[]
): PayoutInfo => {
  if (contract.mechanism === 'cpmm-1') {
    const prob = getProbability(contract)
    return getFixedPayouts(
      outcome,
      contract,
      bets,
      liquidities,
      resolutionProbability ?? prob
    )
  }
  if (
    contract.mechanism === 'cpmm-multi-1' &&
    !contract.shouldAnswersSumToOne &&
    answer
  ) {
    return getIndependentMultiFixedPayouts(
      answer,
      outcome,
      contract as any,
      bets,
      liquidities,
      resolutionProbability ?? answer.prob
    )
  }
  if (contract.mechanism === 'cpmm-multi-1') {
    if (outcome === 'CANCEL') {
      return getFixedCancelPayouts(contract, bets, liquidities)
    }
    if (!resolutions) {
      throw new Error('getPayouts: resolutions required for cpmm-multi-1')
    }
    if (!allAnswers) {
      throw new Error('getPayouts: answers required for cpmm-multi-1')
    }
    // Includes equivalent of 'MKT' and 'YES/NO' resolutions.
    return getMultiFixedPayouts(allAnswers, resolutions, bets, liquidities)
  }
  throw new Error('getPayouts not implemented')
}

export const getFixedPayouts = (
  outcome: string | undefined,
  contract:
    | CPMMContract
    | (CPMMMultiContract & { shouldAnswersSumToOne: false }),
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getStandardFixedPayouts(outcome, contract, bets, liquidities)
    case 'MKT':
      return getMktFixedPayouts(
        contract,
        bets,
        liquidities,
        resolutionProbability
      )
    default:
    case 'CANCEL':
      return getFixedCancelPayouts(contract, bets, liquidities)
  }
}

export const getIndependentMultiFixedPayouts = (
  answer: Answer,
  outcome: string | undefined,
  contract: CPMMMultiContract & { shouldAnswersSumToOne: true },
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  const filteredLiquidities = liquidities
    .filter((l) => l.answerId === answer.id)
    // Also include liquidity that is not assigned to an answer, and divide it by the number of answers.
    .concat(
      liquidities
        .filter((l) => !l.answerId)
        .map((l) => ({ ...l, amount: l.amount / contract.answers.length }))
    )
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getIndependentMultiYesNoPayouts(
        answer,
        outcome,
        bets,
        filteredLiquidities
      )
    case 'MKT':
      return getIndependentMultiMktPayouts(
        answer,
        bets,
        filteredLiquidities,
        resolutionProbability
      )
    default:
    case 'CANCEL':
      return getFixedCancelPayouts(contract, bets, filteredLiquidities)
  }
}
