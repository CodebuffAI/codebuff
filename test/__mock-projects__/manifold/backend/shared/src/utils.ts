import { generateJSON } from '@tiptap/html'
import { getCloudRunServiceUrl } from 'common//api/utils'
import { Contract, contractPath } from 'common/contract'
import { PrivateUser } from 'common/user'
import { extensions } from 'common/util/parse'
import * as admin from 'firebase-admin'
import { first, groupBy, mapValues, sumBy } from 'lodash'
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  ENV_CONFIG,
  GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL,
} from 'common/envs/constants'
import { convertPrivateUser, convertUser } from 'common/supabase/users'
import { convertContract } from 'common/supabase/contracts'
import { Row, tsToMillis } from 'common/supabase/utils'
import { log } from 'shared/monitoring/log'
import { metrics } from 'shared/monitoring/metrics'

export { metrics }
export { log }

export const logMemory = () => {
  const used = process.memoryUsage()
  for (const [k, v] of Object.entries(used)) {
    log(`${k} ${Math.round((v / 1024 / 1024) * 100) / 100} MB`)
  }
}

export function htmlToRichText(html: string) {
  return generateJSON(html, extensions)
}

export const invokeFunction = async (name: string, body?: unknown) => {
  const response = await fetch(getCloudRunServiceUrl(name), {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })

  const json = await response.json()
  if (response.ok) {
    return json
  } else {
    throw new Error(
      `${response.status} invoking ${name}: ${JSON.stringify(json)}`
    )
  }
}

export const revalidateStaticProps = async (
  // Path after domain: e.g. "/JamesGrugett/will-pete-buttigieg-ever-be-us-pres"
  pathToRevalidate: string
) => {
  if (isProd()) {
    const apiSecret = process.env.API_SECRET as string
    if (!apiSecret)
      throw new Error('Revalidation failed because of missing API_SECRET.')

    const queryStr = `?pathToRevalidate=${pathToRevalidate}&apiSecret=${apiSecret}`
    const resp = await fetch(
      `https://${ENV_CONFIG.domain}/api/v0/revalidate` + queryStr
    )

    if (resp.ok) {
      metrics.inc('vercel/revalidations_succeeded', { path: pathToRevalidate })
      log('Revalidated', pathToRevalidate)
    } else {
      metrics.inc('vercel/revalidations_failed', { path: pathToRevalidate })
      try {
        const json = await resp.json()
        log.error(
          `HTTP ${
            resp.status
          } revalidating ${pathToRevalidate}: ${JSON.stringify(json)}`
        )
      } catch (e) {
        const error = e as Error
        log.error(`failed to parse response: ${error.message ?? error}`)
        log.error(`HTTP ${resp.status} revalidating ${pathToRevalidate}`)
      }
    }
  }
}

export async function revalidateContractStaticProps(contract: Contract) {
  await Promise.all([
    revalidateStaticProps(contractPath(contract)),
    revalidateStaticProps(`/embed${contractPath(contract)}`),
  ])
}

// TODO: deprecate in favor of common/src/envs/is-prod.ts
export const isProd = () => {
  // mqp: kind of hacky rn. the first clause is for cloud run API service,
  // second clause is for local scripts and cloud functions
  if (process.env.ENVIRONMENT) {
    return process.env.ENVIRONMENT == 'PROD'
  } else {
    return admin.app().options.projectId === 'mantic-markets'
  }
}

export const getContract = async (
  pg: SupabaseDirectClient,
  contractId: string
) => {
  const res = await pg.map(
    `select data, importance_score, conversion_score, view_count, token from contracts where id = $1
            limit 1`,
    [contractId],
    (row) => convertContract(row)
  )
  return first(res)
}

export const getContractSupabase = async (contractId: string) => {
  const pg = createSupabaseDirectClient()
  return await getContract(pg, contractId)
}

export const getContractFromSlugSupabase = async (contractSlug: string) => {
  const pg = createSupabaseDirectClient()
  const res = await pg.map(
    `select data, importance_score, conversion_score, view_count, token from contracts where slug = $1
            limit 1`,
    [contractSlug],
    (row) => convertContract(row)
  )
  return first(res)
}

export const getUser = async (
  userId: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await pg.oneOrNone(
    `select * from users where id = $1 limit 1`,
    [userId],
    convertUser
  )
}

export const getUsers = async (
  userIds: string[],
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const res = await pg.map(
    `select * from users where id = any($1)`,
    [userIds],
    (row) => convertUser(row)
  )
  return res
}

export const getPrivateUser = async (
  userId: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await pg.oneOrNone(
    `select * from private_users where id = $1 limit 1`,
    [userId],
    convertPrivateUser
  )
}
export const getPrivateUserSupabase = (userId: string) => {
  const pg = createSupabaseDirectClient()

  return pg.oneOrNone(
    `select data from private_users where id = $1`,
    [userId],
    (row) => (row ? (row.data as PrivateUser) : null)
  )
}

export const getPrivateUserByKey = async (
  apiKey: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await pg.oneOrNone(
    `select * from private_users where data->>'apiKey' = $1 limit 1`,
    [apiKey],
    convertPrivateUser
  )
}

export const getPrivateUsersNotSent = async (
  preference: 'trending_markets' | 'profit_loss_updates',
  limit: number,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select pu.data, u.name,
       u.created_time,
       coalesce(((u.data->'creatorTraders'->>'weekly')::bigint),0) as weekly_traders,
       coalesce(((u.data->>'currentBettingStreak')::bigint),0) as current_betting_streak
         from private_users pu
         join users u on pu.id = u.id
         where (pu.data->'notificationPreferences'->>'${preference}')::jsonb @> '["email"]'
         and ${
           preference === 'trending_markets'
             ? 'weekly_trending_email_sent'
             : 'weekly_portfolio_email_sent'
         } = false
         and (pu.data->'notificationPreferences'->>'opt_out_all')::jsonb <> '["email"]'
         and pu.data->>'email' is not null
         limit $1`,
    [limit],
    (row) => ({
      ...(row.data as PrivateUser),
      createdTime: tsToMillis(row.created_time as string),
      name: row.name as string,
      weeklyTraders: row.weekly_traders as number,
      currentBettingStreak: row.current_betting_streak as number,
    })
  )
}

export const getUserByUsername = async (
  username: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const res = await pg.oneOrNone<Row<'users'>>(
    `select * from users where username = $1`,
    username
  )

  return res ? convertUser(res) : null
}

export const checkAndMergePayouts = (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  for (const { payout, deposit } of payouts) {
    if (!isFinite(payout)) {
      throw new Error('Payout is not finite: ' + payout)
    }
    if (deposit !== undefined && !isFinite(deposit)) {
      throw new Error('Deposit is not finite: ' + deposit)
    }
  }

  const groupedPayouts = groupBy(payouts, 'userId')
  return Object.values(
    mapValues(groupedPayouts, (payouts, userId) => ({
      userId,
      payout: sumBy(payouts, 'payout'),
      deposit: sumBy(payouts, (p) => p.deposit ?? 0),
    }))
  )
}

export function contractUrl(contract: Contract) {
  return `https://manifold.markets${contractPath(contract)}`
}

export async function getTrendingContractsToEmail() {
  const pg = createSupabaseDirectClient()
  return await pg.map(
    `select data from contracts
            where resolution_time is null
              and visibility = 'public'
              and not (group_slugs && $1)
              and question not ilike '%stock%'
              and question not ilike '%permanent%'
              and ((close_time > current_date + interval '1 day') or close_time is null)
              order by importance_score desc limit 25;`,
    [GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL],
    (r) => r.data as Contract
  )
}

export const getBettingStreakResetTimeBeforeNow = () => {
  const now = Date.now()
  const currentDateResetTime = new Date().setUTCHours(
    BETTING_STREAK_RESET_HOUR,
    0,
    0,
    0
  )
  // if now is before reset time, use yesterday's reset time
  const lastDateResetTime = currentDateResetTime - DAY_MS
  return now < currentDateResetTime ? lastDateResetTime : currentDateResetTime
}
