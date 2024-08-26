import { OutcomeType } from 'common/contract'
import { groupPath } from './group'
import { PAST_BET } from './user'
import { notification_preference } from './user-notification-preferences'
import { Bet } from 'common/bet'
import { league_user_info } from './leagues'

export type Notification = {
  id: string
  userId: string
  reasonText?: string
  reason: NotificationReason
  createdTime: number
  viewTime?: number
  isSeen: boolean

  sourceId: string
  sourceType: notification_source_types
  sourceUpdateType?: notification_source_update_types

  // sourceContractId is used to group notifications on the same contract together
  sourceContractId?: string
  sourceUserName: string
  sourceUserUsername: string
  sourceUserAvatarUrl: string
  sourceText: string
  data?: { [key: string]: any }

  sourceContractTitle?: string
  sourceContractCreatorUsername?: string
  sourceContractSlug?: string

  sourceSlug?: string
  sourceTitle?: string

  isSeenOnHref?: string
}

export type NotificationReason =
  | notification_reason_types
  | notification_preference

export type notification_source_types =
  | 'contract'
  | 'comment'
  | 'bet'
  | 'answer'
  | 'liquidity'
  | 'follow'
  | 'tip'
  | 'admin_message'
  | 'group'
  | 'user'
  | 'bonus' // strictly unique bettor bonuses atm
  | 'challenge'
  | 'betting_streak_bonus'
  | 'betting_streak_expiring'
  | 'loan'
  | 'tip_and_like'
  | 'badge'
  | 'signup_bonus'
  | 'comment_like'
  | 'contract_like'
  | 'weekly_portfolio_update'
  | 'quest_reward'
  | 'league_change'
  | 'bounty_added'
  | 'mana_payment'
  | 'referral_program'
  | 'follow_suggestion'
  | 'market_review'
  | 'comment_on_lover'
  | 'new_match'
  | 'bet_reply'
  | 'new_message'
  | love_notification_source_types
  | 'push_notification_bonus'
  | 'airdrop'
  | 'manifest_airdrop'
  | 'extra_purchased_mana'

export type love_notification_source_types =
  | 'love_contract'
  | 'love_comment'
  | 'love_answer'
  | 'love_like'
  | 'love_ship'

export type notification_source_update_types =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'deleted'
  | 'closed'
  | 'canceled'
  | 'expired'

/** @deprecated - use a notification_preference (in user-notification-preferences.ts) */
export type notification_reason_types =
  | 'on_new_follow'
  | 'contract_from_followed_user'
  | 'you_referred_user'
  | 'user_joined_to_bet_on_your_market'
  | 'unique_bettors_on_your_contract'
  | 'bet_fill'
  | 'limit_order_cancelled'
  | 'user_joined_from_your_group_invite'
  | 'betting_streak_incremented'
  | 'loan_income'
  | 'comment_on_your_contract'
  | 'answer_on_your_contract'
  | 'comment_on_contract_you_follow'
  | 'answer_on_contract_you_follow'
  | 'update_on_contract_you_follow'
  | 'resolution_on_contract_you_follow'
  | 'comment_on_contract_with_users_shares_in'
  | 'update_on_contract_with_users_shares_in'
  | 'resolution_on_contract_with_users_shares_in'
  | 'comment_on_contract_with_users_answer'
  | 'update_on_contract_with_users_answer'
  | 'resolution_on_contract_with_users_answer'
  | 'answer_on_contract_with_users_answer'
  | 'comment_on_contract_with_users_comment'
  | 'answer_on_contract_with_users_comment'
  | 'update_on_contract_with_users_comment'
  | 'resolution_on_contract_with_users_comment'
  | 'reply_to_users_answer'
  | 'reply_to_users_comment'
  | 'your_contract_closed'
  | 'subsidized_your_market'
  | 'bounty_awarded'
  | 'bounty_added'
  | 'bounty_canceled'
  | 'mana_payment_received'

type notification_descriptions = {
  [key in notification_preference]: {
    simple: string
    detailed: string
    necessary?: boolean
    verb?: string
  }
}
export const NOTIFICATION_DESCRIPTIONS: notification_descriptions = {
  all_answers_on_my_markets: {
    simple: 'Answers on your questions',
    detailed: 'Answers on your own questions',
    verb: 'answered your question',
  },
  all_comments_on_my_markets: {
    simple: 'Comments on your questions',
    detailed: 'Comments on your own questions',
    verb: 'commented on your market',
  },
  betting_streaks: {
    simple: `Prediction streak bonuses & expirations`,
    detailed: `Bonuses and expiration notices for prediction streaks made over consecutive days`,
  },
  all_answers_on_watched_markets: {
    simple: 'All new answers',
    detailed: "All new answers on questions you're watching",
  },
  quest_payout: {
    simple: `Quest completion rewards`,
    detailed: `Bonuses paid out for completing quests`,
  },
  contract_from_followed_user: {
    simple: 'New questions from users you follow',
    detailed: 'New questions from users you follow',
  },
  limit_order_fills: {
    simple: 'Limit order fills, expirations, and cancellations',
    detailed: 'When your limit order fills, cancels, or expires',
  },
  loan_income: {
    simple: 'Automatic loans from your predictions in unresolved questions',
    detailed:
      'Automatic loans from your predictions that are locked in unresolved questions',
  },

  on_new_follow: {
    simple: 'A user followed you',
    detailed: 'A user followed you',
  },
  onboarding_flow: {
    simple: 'Emails to help you get started using Manifold',
    detailed: 'Emails to help you learn how to use Manifold',
  },
  probability_updates_on_watched_markets: {
    simple: 'Large changes in probability on questions that you watch',
    detailed: 'Large changes in probability on questions that you watch',
  },
  profit_loss_updates: {
    simple: 'Weekly portfolio updates',
    detailed: 'Weekly portfolio updates',
  },
  referral_bonuses: {
    simple: 'Referring new users',
    detailed: 'Bonuses you receive from referring a new user',
  },
  resolutions_on_watched_markets: {
    simple: 'All question resolutions',
    detailed: "All resolutions on questions that you're watching",
  },
  resolutions_on_watched_markets_with_shares_in: {
    simple: `Only question resolutions that you've ${PAST_BET}`,
    detailed: `Only resolutions of questions you're watching and that you've ${PAST_BET}`,
  },
  subsidized_your_market: {
    simple: 'Your question was subsidized',
    detailed: 'When someone subsidizes your market',
  },
  tagged_user: {
    simple: 'A user tagged you',
    detailed: 'When another use tags you',
    verb: 'tagged you',
  },
  league_changed: {
    simple: 'Your league changed',
    detailed: 'When you join, move up, or move down a league',
  },
  thank_you_for_purchases: {
    simple: 'Thank you notes for your purchases',
    detailed: 'Thank you notes for your purchases',
  },
  trending_markets: {
    simple: 'Weekly interesting questions',
    detailed: 'Weekly interesting questions',
  },
  unique_bettors_on_your_contract: {
    simple: 'Unique predictors on your questions',
    detailed: 'Bonuses for unique predictors on your questions',
  },
  your_contract_closed: {
    simple: 'Your question has closed and you need to resolve it (necessary)',
    detailed: 'Your question has closed and you need to resolve it (necessary)',
    necessary: true,
  },
  all_comments_on_watched_markets: {
    simple: 'All new comments',
    detailed: 'All new comments on questions you follow',
  },
  all_comments_on_contracts_with_shares_in_on_watched_markets: {
    simple: `Only on questions you've ${PAST_BET}`,
    detailed: `Comments on questions that you're watching and you've ${PAST_BET}`,
  },
  all_replies_to_my_comments_on_watched_markets: {
    simple: 'Only replies to your comments',
    detailed: "Only replies to your comments on questions you're watching",
    verb: 'replied to you',
  },
  all_replies_to_my_answers_on_watched_markets: {
    simple: 'Only replies to your answers',
    detailed: "Only replies to your answers on questions you're watching",
    verb: 'replied to you',
  },
  opt_out_all: {
    simple: 'Opt out of all notifications (excludes when your questions close)',
    detailed:
      'Opt out of all notifications excluding your own question closure notifications',
  },
  user_liked_your_content: {
    simple: 'A user liked your content',
    detailed: 'A user liked your comment, market, or other content',
  },
  bounty_awarded: {
    simple: 'Bounties you receive',
    detailed: 'When the creator awards you a bounty for your comment',
  },
  bounty_added: {
    simple: 'Bounties added to your question',
    detailed: 'When another user adds a bounty to your question',
  },
  bounty_canceled: {
    simple: 'A bounty you follow is canceled',
    detailed: 'When the creator of a bounty cancels it',
  },
  all_votes_on_watched_markets: {
    simple: 'Votes on polls you follow',
    detailed: 'When a user votes on a poll you follow',
  },
  vote_on_your_contract: {
    simple: 'Votes on your polls',
    detailed: 'When a user votes on a poll you created',
  },
  poll_close_on_watched_markets: {
    simple: 'Polls you follow close',
    detailed: 'When a poll you follow closes',
  },
  your_poll_closed: {
    simple: 'Your poll closes',
    detailed: 'When a poll you created closes',
  },
  review_on_your_market: {
    simple: 'Reviews on your questions',
    detailed: 'When a user reviews your question after resolution',
  },
  new_match: {
    simple: 'New matches',
    detailed: 'When you match with another user',
  },
  new_message: {
    simple: 'New messages',
    detailed: 'When another user messages you',
  },
  new_endorsement: {
    simple: 'New endorsements',
    detailed: 'When another user endorses you',
  },
  new_love_like: {
    simple: 'New likes',
    detailed: 'When another user likes you',
  },
  new_love_ship: {
    simple: 'New ships',
    detailed:
      'When another user supports a relationship between you and someone else',
  },
  airdrop: {
    simple: 'You received a gift of mana',
    detailed: 'Manifold has sent you a gift of mana',
  },
  manifest_airdrop: {
    simple: 'You received a gift for attending Manifest',
    detailed: 'Manifold has sent you a gift for attending Manifest',
  },
  extra_purchased_mana: {
    simple: 'You just received 9x your purchased mana in 2024',
    detailed: 'Manifold has sent you a gift of 9x your purchased mana in 2024.',
  },
}

export type BettingStreakData = {
  streak: number
  bonusAmount: number
}
export type LeagueChangeData = {
  previousLeague: league_user_info | undefined
  newLeague: { season: number; division: number; cohort: string }
  bonusAmount: number
}

export type BetFillData = {
  betOutcome: string
  betAnswer?: string
  creatorOutcome: string
  probability: number
  fillAmount: number
  limitOrderTotal?: number
  limitOrderRemaining?: number
  limitAt?: string
  outcomeType?: OutcomeType
}

export type ContractResolutionData = {
  outcome: string
  userPayout: number
  userInvestment: number
  profitRank?: number
  totalShareholders?: number
  profit?: number
  answerId?: string
}

export type UniqueBettorData = {
  bet: Bet
  outcomeType: OutcomeType
  answerText?: string
  min?: number
  max?: number
  isLogScale?: boolean
  isPartner?: boolean
  totalUniqueBettors?: number
  totalAmountBet?: number
}

export type ReviewNotificationData = {
  rating: number
  review: string
}

export type CommentNotificationData = {
  isReply: boolean
}

export type BetReplyNotificationData = {
  betAmount: number
  betOutcome: string
  commentText: string
}

export type AirdropData = {
  amount: number
}

export type ExtraPurchasedManaData = {
  amount: number
}

export function getSourceIdForLinkComponent(
  sourceId: string,
  sourceType?: notification_source_types
) {
  switch (sourceType) {
    case 'answer':
      return `answer-${sourceId}`
    case 'comment':
      return sourceId
    case 'contract':
      return ''
    case 'bet':
      return ''
    default:
      return sourceId
  }
}

export function getSourceUrl(notification: Notification) {
  const {
    sourceType,
    sourceId,
    sourceUserUsername,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
  } = notification
  if (sourceType === 'weekly_portfolio_update')
    return `/week/${sourceUserUsername}/${sourceSlug}`
  if (sourceType === 'follow') return `/${sourceUserUsername}`
  if (sourceType === 'group' && sourceSlug) return `${groupPath(sourceSlug)}`
  // User referral via contract:
  if (
    sourceContractCreatorUsername &&
    sourceContractSlug &&
    sourceType === 'user'
  )
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}`
  // User referral:
  if (sourceType === 'user' && !sourceContractSlug)
    return `/${sourceUserUsername}`
  if (
    sourceType === 'challenge' ||
    ReactionNotificationTypes.includes(sourceType)
  )
    return `${sourceSlug}`
  if (sourceContractCreatorUsername && sourceContractSlug) {
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${getSourceIdForLinkComponent(
      sourceId ?? '',
      sourceType
    )}`
  }
  if (sourceSlug) {
    return `${
      sourceSlug.startsWith('/') ? sourceSlug : '/' + sourceSlug
    }#${getSourceIdForLinkComponent(sourceId ?? '', sourceType)}`
  }
  return ''
}

export const ReactionNotificationTypes: Partial<notification_source_types>[] = [
  'comment_like',
  'contract_like',
]

export const BalanceChangeNotificationTypes: NotificationReason[] = [
  'loan_income',
  // bonuses
  'betting_streak_incremented',
  'unique_bettors_on_your_contract',
  // resolutions
  'resolution_on_contract_with_users_shares_in',
  'resolutions_on_watched_markets_with_shares_in',
  // referrals
  'you_referred_user',
  'user_joined_to_bet_on_your_market',
  'user_joined_from_your_group_invite',
  'quest_payout',
  'bet_fill',
  'mana_payment_received',
]
