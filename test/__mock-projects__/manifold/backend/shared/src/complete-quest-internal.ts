import { User } from 'common/user'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { QuestRewardTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getRecentContractIds } from 'common/supabase/contracts'
import { APIError } from 'common//api/utils'
import { createQuestPayoutNotification } from 'shared/create-notification'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { getQuestScore, setQuestScoreValue } from 'common/supabase/set-scores'
import { millisToTs, SupabaseClient } from 'common/supabase/utils'
import { getReferralCount } from 'common/supabase/referrals'
import { log } from 'shared/utils'
import { WEEK_MS } from 'common/util/time'

dayjs.extend(utc)
dayjs.extend(timezone)

export const completeSharingQuest = async (user: User) => {
  const db = createSupabaseClient()
  const count = await getCurrentCountForQuest(user.id, 'SHARES', db)
  const oldEntry = await getQuestScore(user.id, 'SHARES', db)
  return await completeQuestInternal(
    user,
    'SHARES',
    oldEntry.score,
    count,
    undefined
  )
}

export const completeCalculatedQuestFromTrigger = async (
  user: User,
  questType: 'MARKETS_CREATED',
  // idempotencyKey is used to prevent duplicate quest completions from triggers firing multiple times
  idempotencyKey: string,
  contractId: string
) => {
  const db = createSupabaseClient()
  const startOfWeek = dayjs()
    .tz('America/Los_Angeles')
    .startOf('week')
    .add(1, 'day')
    .valueOf()
  const contractIds = await getRecentContractIds(user.id, startOfWeek, db)
  // In case replication hasn't happened yet, add the id manually
  if (!contractIds.includes(contractId)) contractIds.push(contractId)
  const count = contractIds.length
  log(
    'markets created this week count:',
    count,
    'for user:',
    user.id,
    'and idempotencyKey:',
    idempotencyKey
  )
  const oldEntry = await getQuestScore(user.id, questType, db)
  log('current quest entry:', oldEntry, 'for user:', user.id)
  if (idempotencyKey && oldEntry.idempotencyKey === idempotencyKey)
    return { count: oldEntry.score }
  return await completeQuestInternal(
    user,
    questType,
    oldEntry.score,
    count,
    idempotencyKey
  )
}

export const completeReferralsQuest = async (userId: string) => {
  // Bc we don't issue a payout here, (onCreateBet does that) we don't need an idempotency key
  const db = createSupabaseClient()
  const questDetails = QUEST_DETAILS['REFERRALS']
  const count = await getCurrentCountForQuest(userId, 'REFERRALS', db)
  log('completing referrals quest', {
    userId,
    count,
  })
  await setQuestScoreValue(userId, questDetails.scoreId, count, db)
}

const completeQuestInternal = async (
  user: User,
  questType: QuestType,
  oldScore: number,
  count: number,
  idempotencyKey: string | undefined
) => {
  const db = createSupabaseClient()
  const questDetails = QUEST_DETAILS[questType]
  await setQuestScoreValue(
    user.id,
    questDetails.scoreId,
    count,
    db,
    idempotencyKey
  )
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  log('completing quest', {
    questType,
    userId: user.id,
    oldScore,
    newScore: count,
    startOfDay,
    requiredCount: questDetails.requiredCount,
  })
  // If they have created the required amounts, send them a quest txn reward
  if (count !== oldScore && count === QUEST_DETAILS[questType].requiredCount) {
    const resp = await awardQuestBonus(user, questType, count)

    await createQuestPayoutNotification(
      user,
      resp.txn.id,
      resp.bonusAmount,
      count,
      questType
    )
    return resp
  }
  return { count }
}

const getCurrentCountForQuest = async (
  userId: string,
  questType: 'SHARES' | 'REFERRALS',
  db: SupabaseClient
): Promise<number> => {
  if (questType === 'SHARES') {
    const startOfDay = dayjs()
      .tz('America/Los_Angeles')
      .startOf('day')
      .valueOf()
    const startTs = millisToTs(startOfDay)
    log('getting shares count for user', userId, 'from startTs', startTs)
    return await getUserShareEventsCount(userId, startTs)
  } else if (questType === 'REFERRALS') {
    let startOfWeek = dayjs()
      .tz('America/Los_Angeles')
      .startOf('week')
      .add(1, 'day')
      .valueOf()
    const ptNow = dayjs().tz('America/Los_Angeles').valueOf()
    if (ptNow < startOfWeek) startOfWeek = startOfWeek - WEEK_MS
    log(
      'refer-user: getting referrals count for user',
      userId,
      'from startOfWeek ts:',
      startOfWeek
    )
    return await getReferralCount(userId, startOfWeek, db)
  } else return 0
}

const awardQuestBonus = async (
  user: User,
  questType: QuestType,
  newCount: number
) => {
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()

  const pg = createSupabaseDirectClient()
  return await pg.tx(async (tx) => {
    // make sure we don't already have a txn for this user/questType
    const previousTxn = await tx.oneOrNone(
      `select * from txns
      where to_id = $1
      and category = 'QUEST_REWARD'
      and data->'data'->>'questType' = $2
      and (data->'data'->>'questCount')::integer = $3
      and created_time >= millis_to_ts($4)
      limit 1`,
      [user.id, questType, newCount, startOfDay]
    )

    if (previousTxn) {
      throw new APIError(400, 'Already awarded quest bonus today')
    }

    const rewardAmount = QUEST_DETAILS[questType].rewardAmount

    const bonusTxnData = {
      questType,
      questCount: newCount,
    }

    const bonusTxn: Omit<QuestRewardTxn, 'fromId' | 'id' | 'createdTime'> = {
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: rewardAmount,
      token: 'M$',
      category: 'QUEST_REWARD',
      data: bonusTxnData,
    }
    const txn = await runTxnFromBank(tx, bonusTxn)
    return { txn, bonusAmount: rewardAmount }
  })
}

export async function getUserShareEventsCount(userId: string, startTs: string) {
  const pg = createSupabaseDirectClient()
  const res = await pg.one(
    `select count(*)::int from user_contract_interactions
                where user_id = $1 and name = 'page share'
                  and created_time >= $2`,
    [userId, startTs]
  )
  return res.count
}
