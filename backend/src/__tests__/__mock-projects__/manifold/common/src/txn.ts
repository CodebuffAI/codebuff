// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)

import { QuestType } from 'common/quest'
import { league_user_info } from './leagues'

type AnyTxnType =
  | Donation
  | Tip
  | LootBoxPurchase
  | Manalink
  | Referral
  | UniqueBettorBonus
  | BettingStreakBonus
  | CancelUniqueBettorBonus
  | CharityFee
  | ManaPurchase
  | SignupBonus
  | ContractOldResolutionPayout
  | ContractProduceSpice
  | ContractUndoProduceSpice
  | ConsumeSpice
  | ConsumeSpiceDone
  | QfPayment
  | QfAddPool
  | QfDividend
  | PostAdCreate
  | PostAdRedeem
  | MarketAdCreate
  | MarketAdRedeem
  | MarketAdRedeemFee
  | QuestReward
  | QAndACreate
  | QAndAAward
  | LeaguePrize
  | BountyPosted
  | BountyAwarded
  | BountyAdded
  | BountyCanceled
  | ManaPay
  | Loan
  | PushNotificationBonus
  | LikePurchase
  | ContractUndoOldResolutionPayout
  | ContractAnte
  | AddSubsidy
  | ReclaimMana
  | ManachanTweet
  | BotCommentFee
  | AirDrop
  | ManifestAirDrop
  | ExtraPurchasedMana
  | ManifoldTopUp
  | CashBonus
  | CashOutPending

export type AnyTxnCategory = AnyTxnType['category']

export type SourceType = 'USER' | 'CONTRACT' | 'CHARITY' | 'BANK' | 'AD'

export type Txn<T extends AnyTxnType = AnyTxnType> = {
  id: string
  createdTime: number

  fromId: string
  fromType: SourceType

  toId: string
  toType: SourceType

  amount: number
  token: 'M$' | 'SHARE' | 'SPICE' | 'CASH' // if you add a new type, update the check in txn table schema

  category: AnyTxnType['category']

  /** Human-readable description. In data->>'description' in the db */
  description?: string

  /** Any extra data. For legacy reasons, in data->'data' in the db */
  data?: { [key: string]: any }
} & T

type LootBoxPurchase = {
  category: 'LOOTBOX_PURCHASE'
  fromType: 'USER'
  toType: 'BANK'
  token: 'M$'
}

type Donation = {
  fromType: 'USER'
  toType: 'CHARITY'
  category: 'CHARITY'
  token: 'SPICE' | 'M$'
}

type Tip = {
  fromType: 'USER'
  toType: 'USER'
  category: 'TIP'
  data: {
    commentId: string
    contractId?: string
    groupId?: string
  }
}

type Manalink = {
  fromType: 'USER'
  toType: 'USER'
  category: 'MANALINK'
}

type Referral = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'REFERRAL'
}

type UniqueBettorBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'UNIQUE_BETTOR_BONUS'
  data: {
    contractId: string
    uniqueNewBettorId?: string
    // Old unique bettor bonus txns stored all unique bettor ids
    uniqueBettorIds?: string[]
    isPartner: boolean
  }
}

type BettingStreakBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'BETTING_STREAK_BONUS'
  data: {
    currentBettingStreak?: number
    contractId?: string
  }
}

type CancelUniqueBettorBonus = {
  fromType: 'USER'
  toType: 'BANK'
  category: 'CANCEL_UNIQUE_BETTOR_BONUS'
  data: {
    contractId: string
  }
}

type CharityFee = {
  fromType: 'USER'
  toType: 'BANK'
  category: 'CHARITY_FEE'
  token: 'SPICE'
  data: {
    charityId: string
  }
}

type ManaPurchase = {
  fromId: 'EXTERNAL'
  fromType: 'BANK'
  toType: 'USER'
  category: 'MANA_PURCHASE'
  data:
    | {
        iapTransactionId: string
        type: 'apple'
        // TODO: backfill this.
        paidInCents?: number
      }
    | {
        stripeTransactionId: string
        type: 'stripe'
        // TODO: backfill this.
        paidInCents?: number
      }
    | {
        transactionId: string
        type: 'gidx'
        paidInCents?: number
      }
}
type CashBonus = {
  fromId: 'EXTERNAL'
  fromType: 'BANK'
  toType: 'USER'
  category: 'CASH_BONUS'
  data: {
    transactionId: string
    type: 'gidx'
  }
}

type CashOutPending = {
  fromType: 'USER'
  toType: 'BANK'
  token: 'CASH'
  category: 'CASH_OUT_PENDING'
  data: {
    transactionId: string
    type: 'gidx'
    payoutInDollars: number
  }
}

type SignupBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'SIGNUP_BONUS'
}

type ContractOldResolutionPayout = {
  fromType: 'CONTRACT'
  toType: 'USER'
  category: 'CONTRACT_RESOLUTION_PAYOUT'
  token: 'M$' | 'CASH'
  data: {
    /** @deprecated - we use CONTRACT_UNDO_RESOLUTION_PAYOUT **/
    reverted?: boolean
    deposit?: number
    payoutStartTime?: number
    answerId?: string
  }
}

// destroys mana in contract
type ContractProduceSpice = {
  fromType: 'CONTRACT'
  toType: 'USER'
  category: 'PRODUCE_SPICE'
  token: 'SPICE'
  data: {
    deposit?: number
    payoutStartTime?: number
    answerId?: string
  }
}

// these come in pairs to convert spice to mana
type ConsumeSpice = {
  fromType: 'USER'
  toType: 'BANK'
  category: 'CONSUME_SPICE'
  token: 'SPICE'
  data: {
    siblingId: string
  }
}
type ConsumeSpiceDone = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'CONSUME_SPICE_DONE'
  token: 'M$'
  data: {
    siblingId: string
  }
}

type ContractAnte = {
  fromType: 'USER' | 'BANK'
  toType: 'CONTRACT'
  category: 'CREATE_CONTRACT_ANTE'
  token: 'M$' | 'CASH'
}

type ContractUndoOldResolutionPayout = {
  fromType: 'USER'
  toType: 'CONTRACT'
  category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
  token: 'M$' | 'CASH'
  data: {
    revertsTxnId: string
  }
}

type ContractUndoProduceSpice = {
  fromType: 'USER'
  toType: 'CONTRACT'
  category: 'CONTRACT_UNDO_PRODUCE_SPICE'
  token: 'SPICE'
  data: {
    revertsTxnId: string
  }
}

type QfId = {
  qfId: string
}

type QfPayment = {
  category: 'QF_PAYMENT'
  fromType: 'USER'
  toType: 'USER'
  data: {
    answerId: string
  }
}

type QfAddPool = {
  category: 'QF_ADD_POOL'
  fromType: 'USER'
  toType: 'CONTRACT'
}

type QfDividend = {
  category: 'QF_DIVIDEND'
  fromType: 'CONTRACT'
  toType: 'USER'
}

type PostAdCreate = {
  category: 'AD_CREATE'
  fromType: 'USER'
  toType: 'AD'
}

type PostAdRedeem = {
  category: 'AD_REDEEM'
  fromType: 'AD'
  toType: 'USER'
}

type MarketAdCreate = {
  category: 'MARKET_BOOST_CREATE'
  fromType: 'USER'
  toType: 'AD'
  data: {
    contractId?: string
  }
}

type MarketAdRedeem = {
  category: 'MARKET_BOOST_REDEEM'
  fromType: 'AD'
  toType: 'USER'
}

type MarketAdRedeemFee = {
  category: 'MARKET_BOOST_REDEEM_FEE'
  fromType: 'AD'
  toType: 'BANK'
}

type QuestReward = {
  category: 'QUEST_REWARD'
  fromType: 'BANK'
  toType: 'USER'
  data: {
    questType: QuestType
    questCount: number
  }
}

type QAndACreate = {
  category: 'Q_AND_A_CREATE'
  fromType: 'USER'
  toType: 'BANK'
  data: {
    q_and_a_id: string
  }
}

type QAndAAward = {
  category: 'Q_AND_A_AWARD'
  fromType: 'BANK'
  toType: 'USER'
  data: {
    q_and_a_id: string
  }
}

type LeaguePrize = {
  category: 'LEAGUE_PRIZE'
  fromType: 'BANK'
  toType: 'USER'
  data: league_user_info
}

type BountyPosted = {
  category: 'BOUNTY_POSTED'
  fromType: 'USER'
  toType: 'CONTRACT'
  token: 'M$'
}

type BountyAdded = {
  category: 'BOUNTY_ADDED'
  fromType: 'USER'
  toType: 'CONTRACT'
  token: 'M$'
}

type BountyAwarded = {
  category: 'BOUNTY_AWARDED'
  fromType: 'CONTRACT'
  toType: 'USER'
  token: 'M$'
}

type BountyCanceled = {
  category: 'BOUNTY_CANCELED'
  fromType: 'CONTRACT'
  toType: 'USER'
  token: 'M$'
}

type ManaPay = {
  category: 'MANA_PAYMENT'
  fromType: 'USER'
  toType: 'USER'
  token: 'M$' | 'SPICE'
  data: {
    visibility: 'public' | 'private'
    message: string
    groupId: string // for multiple payments
  }
}

type Loan = {
  category: 'LOAN'
  fromType: 'BANK'
  toType: 'USER'
  token: 'M$'
}

type PushNotificationBonus = {
  category: 'PUSH_NOTIFICATION_BONUS'
  fromType: 'BANK'
  toType: 'USER'
  token: 'M$'
}

type LikePurchase = {
  category: 'LIKE_PURCHASE'
  fromType: 'USER'
  toType: 'BANK'
  token: 'M$'
}

type AddSubsidy = {
  category: 'ADD_SUBSIDY'
  fromType: 'USER'
  toType: 'CONTRACT'
  token: 'M$' | 'CASH'
}

type ReclaimMana = {
  category: 'RECLAIM_MANA'
  fromType: 'USER'
  toType: 'BANK'
  token: 'M$'
}

type ManachanTweet = {
  category: 'MANACHAN_TWEET'
  fromType: 'USER'
  toType: 'BANK'
  token: 'M$'
}

type BotCommentFee = {
  category: 'BOT_COMMENT_FEE'
  fromType: 'USER'
  toType: 'BANK'
  token: 'M$'
}

type AirDrop = {
  category: 'AIR_DROP'
  fromType: 'BANK'
  toType: 'USER'
  token: 'M$'
}

type ManifestAirDrop = {
  category: 'MANIFEST_AIR_DROP'
  fromType: 'BANK'
  toType: 'USER'
  token: 'M$'
}

type ExtraPurchasedMana = {
  category: 'EXTRA_PURCHASED_MANA'
  fromType: 'BANK'
  toType: 'USER'
  token: 'M$'
}

type ManifoldTopUp = {
  category: 'MANIFOLD_TOP_UP'
  fromType: 'BANK'
  toType: 'USER'
  token: 'M$'
}

export type AddSubsidyTxn = Txn & AddSubsidy
export type DonationTxn = Txn & Donation
export type TipTxn = Txn & Tip
export type ManalinkTxn = Txn & Manalink
export type ReferralTxn = Txn & Referral
export type BettingStreakBonusTxn = Txn & BettingStreakBonus
export type UniqueBettorBonusTxn = Txn & UniqueBettorBonus
export type CancelUniqueBettorBonusTxn = Txn & CancelUniqueBettorBonus
export type CharityFeeTxn = Txn & CharityFee
export type ManaPurchaseTxn = Txn & ManaPurchase
export type SignupBonusTxn = Txn & SignupBonus
export type ContractOldResolutionPayoutTxn = Txn & ContractOldResolutionPayout
export type ContractUndoOldResolutionPayoutTxn = Txn &
  ContractUndoOldResolutionPayout
export type ContractProduceSpiceTxn = Txn & ContractProduceSpice
export type ContractUndoProduceSpiceTxn = Txn & ContractUndoProduceSpice
export type ConsumeSpiceTxn = Txn & ConsumeSpice
export type ConsumeSpiceDoneTxn = Txn & ConsumeSpiceDone

export type QfTxn = Txn & QfId
export type QfPaymentTxn = QfTxn & QfPayment
export type QfAddPoolTxn = QfTxn & QfAddPool
export type QfDividendTxn = QfTxn & QfDividend
export type PostAdCreateTxn = Txn & PostAdCreate
export type PostAdRedeemTxn = Txn & PostAdRedeem
export type MarketAdCreateTxn = Txn & MarketAdCreate
export type MarketAdRedeemTxn = Txn & MarketAdRedeem
export type MarketAdRedeemFeeTxn = Txn & MarketAdRedeemFee
export type QuestRewardTxn = Txn & QuestReward
export type LootBoxPurchaseTxn = Txn & LootBoxPurchase
export type QAndACreateTxn = Txn & QAndACreate
export type QAndAAwardTxn = Txn & QAndAAward
export type LeaguePrizeTxn = Txn & LeaguePrize
export type BountyAwardedTxn = Txn & BountyAwarded
export type BountyPostedTxn = Txn & BountyPosted
export type BountyAddedTxn = Txn & BountyAdded
export type BountyCanceledTxn = Txn & BountyCanceled
export type ManaPayTxn = Txn & ManaPay
export type LoanTxn = Txn & Loan
export type PushNotificationBonusTxn = Txn & PushNotificationBonus
export type LikePurchaseTxn = Txn & LikePurchase
export type ReclaimManaTxn = Txn & ReclaimMana
export type ManachanTweetTxn = Txn & ManachanTweet
export type BotCommentFeeTxn = Txn & BotCommentFee
export type AirDropTxn = Txn & AirDrop
export type ManifestAirDropTxn = Txn & ManifestAirDrop
export type ExtraPurchasedManaTxn = Txn & ExtraPurchasedMana
export type ManifoldTopUpTxn = Txn & ManifoldTopUp
