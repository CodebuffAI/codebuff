import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Visibility } from 'common/contract'
import { QuestType } from 'common/quest'
import { Answer } from 'common/answer'
import { AnyTxnCategory, Txn } from './txn'

export type AnyBalanceChangeType = BetBalanceChange | TxnBalanceChange

export type BalanceChange = {
  type: string
  key: string
  amount: number
  createdTime: number
}

type MinimalContract = {
  question: string
  slug?: string
  visibility: Visibility
  creatorUsername: string
}

export const BET_BALANCE_CHANGE_TYPES = [
  'create_bet',
  'sell_shares',
  'redeem_shares',
  'fill_bet',
  'loan_payment',
] as const

export type BetBalanceChange = BalanceChange & {
  type: (typeof BET_BALANCE_CHANGE_TYPES)[number]
  bet: Pick<Bet, 'outcome' | 'shares'>
  answer: Pick<Answer, 'text' | 'id'> | undefined
  contract: MinimalContract
}

export type TxnBalanceChange = BalanceChange & {
  type: AnyTxnCategory
  token: Txn['token']
  contract?: MinimalContract
  questType?: QuestType
  user?: Pick<User, 'username' | 'name'>
  charity?: { name: string; slug: string }
  description?: string
}

export const isBetChange = (
  change: AnyBalanceChangeType
): change is BetBalanceChange =>
  BET_BALANCE_CHANGE_TYPES.includes(change.type as any)

export const isTxnChange = (
  change: AnyBalanceChangeType
): change is TxnBalanceChange => !('bet' in change)
