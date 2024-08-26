import { sumBy, uniq } from 'lodash'

import { APIError, type APIHandler } from './helpers/endpoint'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import {
  PARTNER_QUARTER_START_DATE,
  PARTNER_RETAINED_REFERRAL_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
  PARTNER_UNIQUE_TRADER_THRESHOLD,
  getPartnerQuarterEndDate,
} from 'common/partner'
import { OutcomeType } from 'common/contract'

export const getPartnerStats: APIHandler<'get-partner-stats'> = async (
  props
) => {
  const { userId } = props

  if (!PARTNER_USER_IDS.includes(userId))
    throw new APIError(403, 'User is not a partner')

  const pg = createSupabaseDirectClient()

  const manifoldStartStr = new Date('2021-12-01').toISOString()
  const quarterStartStr = PARTNER_QUARTER_START_DATE.toISOString()
  const quarterEndStr = getPartnerQuarterEndDate(
    PARTNER_QUARTER_START_DATE
  ).toISOString()
  const quarterStart = PARTNER_QUARTER_START_DATE.getTime()
  const quarterEnd = getPartnerQuarterEndDate(
    PARTNER_QUARTER_START_DATE
  ).getTime()

  const userResult = await pg.one<{
    username: string
  }>(`SELECT username FROM users WHERE id = $1`, [userId])

  const username = userResult?.username ?? 'Unknown'

  const numContractsCreated = await getNumContractsCreated(
    pg,
    userId,
    quarterStart,
    quarterEnd
  )

  const thisQuarterContractTraders = await getCreatorTradersByContract(
    pg,
    userId,
    quarterStartStr,
    quarterEndStr
  )
  const contractIds = uniq(thisQuarterContractTraders.map((t) => t.contract_id))
  const previousContractTraders = await getCreatorTradersByContract(
    pg,
    userId,
    manifoldStartStr,
    quarterStartStr,
    contractIds
  )
  const previousContractTradersObj = Object.fromEntries(
    previousContractTraders.map((t) => [t.contract_id, t])
  )
  const totalContractTraders = await getCreatorTradersByContract(
    pg,
    userId,
    manifoldStartStr,
    quarterEndStr,
    contractIds
  )

  const newContractTraders = totalContractTraders
    .map((t) => {
      const previous = previousContractTradersObj[t.contract_id]
      return {
        ...t,
        total: t.total - (previous?.total ?? 0),
      }
    })
    .filter((t) => t.total > 0)
  const newContractTradersObj = Object.fromEntries(
    newContractTraders.map((t) => [t.contract_id, t])
  )

  const contractIdsMeetingThreshold = new Set(
    totalContractTraders
      .filter(
        (traders) =>
          traders.total >= PARTNER_UNIQUE_TRADER_THRESHOLD &&
          newContractTradersObj[traders.contract_id]?.total
      )
      .map((t) => t.contract_id)
  )
  const thisQuarterContractTradersMeetingThreshold = newContractTraders.filter(
    (t) => contractIdsMeetingThreshold.has(t.contract_id)
  )

  const numUniqueBettors: number = sumBy(
    thisQuarterContractTradersMeetingThreshold,
    'total'
  )
  const numBinaryBettors = sumBy(
    thisQuarterContractTradersMeetingThreshold,
    (t) => (t.outcome_type === 'BINARY' ? t.total : 0)
  )
  const numMultiChoiceBettors = sumBy(
    thisQuarterContractTradersMeetingThreshold,
    (t) => (t.outcome_type === 'MULTIPLE_CHOICE' ? t.total : 0)
  )

  const referrals = await pg.manyOrNone<{
    id: number
  }>(
    `select id
  from users
  where
    data->>'referredByUserId' = $1
    and created_time > millis_to_ts($2)
    and created_time < millis_to_ts($3)
  `,
    [userId, quarterStart, quarterEnd]
  )

  const numReferrals = referrals.length

  const daysRetained = 5
  const referralsWhoRetained = await pg.map<string>(
    `
with bet_days AS (
  SELECT user_id, DATE(contract_bets.created_time) AS bet_day
  FROM contract_bets
  where contract_bets.user_id = any($1)
  and contract_bets.created_time > $2
  and contract_bets.created_time < $3
  GROUP BY user_id, DATE(contract_bets.created_time)
),
user_bet_days AS (
  SELECT user_id, COUNT(bet_day) AS total_bet_days
  FROM bet_days
  GROUP BY user_id
)
select user_id from user_bet_days where total_bet_days >= $4
`,
    [referrals.map((r) => r.id), quarterStartStr, quarterEndStr, daysRetained],
    (row) => row.user_id
  )
  const numReferralsWhoRetained = referralsWhoRetained.length

  const numBinaryBettorsNumber = Number(numBinaryBettors) || 0
  const numMultiChoiceBettorsNumber = Number(numMultiChoiceBettors) || 0
  const numReferralsNumber = Number(numReferrals) || 0
  const retainedReferralsIncome =
    numReferralsWhoRetained * PARTNER_RETAINED_REFERRAL_BONUS

  const totalTraderIncome =
    numBinaryBettorsNumber * PARTNER_UNIQUE_TRADER_BONUS +
    numMultiChoiceBettorsNumber * PARTNER_UNIQUE_TRADER_BONUS_MULTI
  const dollarsEarned =
    totalTraderIncome + numReferralsNumber + retainedReferralsIncome

  return {
    status: 'success',
    username,
    numContractsCreated,
    numUniqueBettors,
    numReferrals,
    numReferralsWhoRetained,
    totalTraderIncome,
    totalReferralIncome: numReferralsNumber + retainedReferralsIncome,
    dollarsEarned,
  }
}

const getCreatorTradersByContract = async (
  pg: SupabaseDirectClient,
  creatorId: string,
  since: string,
  before: string,
  contractIds?: string[]
) => {
  return await pg.manyOrNone<{
    contract_id: string
    outcome_type: OutcomeType
    total: number
  }>(
    `with contract_traders as (
        select distinct contract_id, user_id
        from contract_bets
        where created_time >= $2
        and created_time < $3
        and ($4 is null or contract_id = any($4))
        and is_redemption = false
        and (is_api is null or is_api = false)
        and amount != 0
        and user_id != $1
      )
      select c.id as contract_id, outcome_type, count(*)::int as total
      from contracts as c
      join contract_traders as ct on c.id = ct.contract_id
      where c.creator_id = $1
      and c.visibility = 'public'
      and (c.data->>'isSubsidized' is null or c.data->>'isSubsidized' = 'true')
      group by c.id, outcome_type`,
    [creatorId, since, before, contractIds ?? null]
  )
}
const getNumContractsCreated = async (
  pg: SupabaseDirectClient,
  creatorId: string,
  quarterStart: number,
  quarterEnd: number
) => {
  const result = await pg.one(
    `
  select count(*) as count
  from contracts
  where creator_id = $1
  and created_time >= $2
  and created_time < $3
  and mechanism != 'none'`,
    [
      creatorId,
      new Date(quarterStart).toISOString(),
      new Date(quarterEnd).toISOString(),
    ]
  )

  return result.count
}
