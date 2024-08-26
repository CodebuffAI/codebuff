import { partition, sumBy } from 'lodash'

import { Bet } from './bet'
import { Contract } from './contract'
import { noFees } from './fees'
import { CandidateBet } from './new-bet'
import { removeUndefinedProps } from './util/object'

type RedeemableBet = Pick<Bet, 'outcome' | 'shares' | 'loanAmount'>

export const getBinaryRedeemableAmount = (bets: RedeemableBet[]) => {
  const [yesBets, noBets] = partition(bets, (b) => b.outcome === 'YES')
  const yesShares = sumBy(yesBets, (b) => b.shares)
  const noShares = sumBy(noBets, (b) => b.shares)

  const shares = Math.max(Math.min(yesShares, noShares), 0)
  const soldFrac = shares > 0 ? shares / Math.max(yesShares, noShares) : 0

  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const loanPayment = loanAmount * soldFrac
  const netAmount = shares - loanPayment
  return { shares, loanPayment, netAmount }
}

export const getRedemptionBets = (
  contract: Contract,
  shares: number,
  loanPayment: number,
  prob: number,
  answerId: string | undefined
) => {
  const createdTime = Date.now()
  const yesBet: CandidateBet = removeUndefinedProps({
    contractId: contract.id,
    amount: prob * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'YES',
    probBefore: prob,
    probAfter: prob,
    createdTime,
    fees: noFees,
    isRedemption: true,
    visibility: contract.visibility,
    answerId,
  })
  const noBet: CandidateBet = removeUndefinedProps({
    contractId: contract.id,
    amount: (1 - prob) * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'NO',
    probBefore: prob,
    probAfter: prob,
    createdTime,
    fees: noFees,
    isRedemption: true,
    visibility: contract.visibility,
    answerId,
  })
  return [yesBet, noBet]
}
