export const QUEST_TYPES = [
  'BETTING_STREAK',
  'SHARES',
  'MARKETS_CREATED',
  'REFERRALS',
] as const
export type QuestType = (typeof QUEST_TYPES)[number]

export const QUEST_DETAILS: Record<
  QuestType,
  {
    requiredCount: number
    rewardAmount: number
    scoreId: string
    title: string
  }
> = {
  BETTING_STREAK: {
    requiredCount: 1,
    rewardAmount: 250,
    scoreId: 'currentBettingStreak',
    title: 'Prediction Streak',
  },
  SHARES: {
    requiredCount: 1,
    rewardAmount: 10,
    scoreId: 'sharesToday',
    title: 'Sharing',
  },
  MARKETS_CREATED: {
    requiredCount: 1,
    rewardAmount: 100,
    scoreId: 'marketsCreatedThisWeek',
    title: 'Question Creation',
  },
  REFERRALS: {
    requiredCount: 1,
    rewardAmount: 1000,
    scoreId: 'referralsThisWeek',
    title: 'Referrals',
  },
}
export const QUEST_SCORE_IDS = QUEST_TYPES.map((t) => QUEST_DETAILS[t].scoreId)
