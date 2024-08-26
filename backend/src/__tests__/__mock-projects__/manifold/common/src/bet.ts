import { groupBy, mapValues } from 'lodash'
import { Fees } from './fees'
import { maxMinBin } from './chart'

/************************************************

supabase status: columns exist for
  userId: text
  createdTime: timestamp (from millis)
  amount: number
  shares: number
  outcome: text
  probBefore: number
  probAfter: number
  isRedemption: boolean
  visibility: text

*************************************************/

export type Bet = {
  id: string
  userId: string

  contractId: string
  answerId?: string // For multi-binary contracts
  createdTime: number
  updatedTime?: number // Generated on supabase, useful for limit orders

  amount: number // bet size; negative if SELL bet
  loanAmount?: number
  outcome: string
  shares: number // dynamic parimutuel pool weight or fixed ; negative if SELL bet

  probBefore: number
  probAfter: number

  fees: Fees

  isApi?: boolean // true if bet was placed via API

  isRedemption: boolean
  /** @deprecated */
  challengeSlug?: string

  replyToCommentId?: string
  betGroupId?: string // Used to group buys on MC sumsToOne contracts
} & Partial<LimitProps>

export type NumericBet = Bet & {
  value: number
  allOutcomeShares: { [outcome: string]: number }
  allBetAmounts: { [outcome: string]: number }
}

// Binary market limit order.
export type LimitBet = Bet & LimitProps

type LimitProps = {
  orderAmount: number // Amount of mana in the order
  limitProb: number // [0, 1]. Bet to this probability.
  isFilled: boolean // Whether all of the bet amount has been filled.
  isCancelled: boolean // Whether to prevent any further fills.
  // A record of each transaction that partially (or fully) fills the orderAmount.
  // I.e. A limit order could be filled by partially matching with several bets.
  // Non-limit orders can also be filled by matching with multiple limit orders.
  fills: fill[]
  expiresAt?: number // ms since epoch.
}

export type fill = {
  // The id the bet matched against, or null if the bet was matched by the pool.
  matchedBetId: string | null
  amount: number
  shares: number
  timestamp: number
  // Note: Old fills might have no fees, and the value would be undefined.
  fees: Fees
  // If the fill is a sale, it means the matching bet has shares of the same outcome.
  // I.e. -fill.shares === matchedBet.shares
  isSale?: boolean
}

export const calculateMultiBets = (
  betPoints: {
    x: number
    y: number
    answerId: string
  }[]
) => {
  return mapValues(groupBy(betPoints, 'answerId'), (bets) =>
    maxMinBin(
      bets.sort((a, b) => a.x - b.x),
      500
    )
  )
}
export type maker = {
  bet: LimitBet
  amount: number
  shares: number
  timestamp: number
}
